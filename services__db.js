import { calculateUnitConversions } from './utils__unitTree.js?v=7.9.4.90-cashtop3-search-logo';
const DB_BASE_NAME = 'Oscar_Accounting_POS_DB';
const DB_VERSION = 6;
export const getTenantId = () => String(window.OscarActivation?.readRuntime?.()?.companyId || 'local').trim() || 'local';
const dbNameForTenant = (tenantId = getTenantId()) => `${DB_BASE_NAME}__${encodeURIComponent(String(tenantId || 'local').trim() || 'local')}`;
let cachedTenant = '';
// Realtime sync broadcast channel for cross-tab communication
export const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('oscar_pos_sync')
    : null;
let cachedDB = null;
let dbOpenPromise = null;
let openingTenant = '';

// Close a cached connection immediately when a different company is activated.
// This prevents an in-flight/open IndexedDB handle from ever leaking into the next tenant.
if (typeof window !== 'undefined') {
    window.addEventListener('oscar:activation-loaded', (event) => {
        const nextTenant = String(event?.detail?.companyId || '').trim();
        if (cachedDB && cachedTenant && nextTenant && cachedTenant !== nextTenant) {
            try { cachedDB.close(); } catch {}
            cachedDB = null;
            cachedTenant = '';
            dbOpenPromise = null;
            openingTenant = '';
        }
    });
}
let storageStatusPromise = null;
export async function enablePersistentLocalStorage() {
    if (storageStatusPromise) return storageStatusPromise;
    storageStatusPromise = (async () => {
        try {
            const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
            if (!storage) return { supported: false, persisted: false };
            let persisted = false;
            try { persisted = !!(await storage.persisted?.()); } catch {}
            if (!persisted) { try { persisted = !!(await storage.persist?.()); } catch {} }
            let estimate = {};
            try { estimate = await storage.estimate?.() || {}; } catch {}
            const detail = { supported: true, persisted, usage: Number(estimate.usage || 0), quota: Number(estimate.quota || 0), at: Date.now() };
            try { localStorage.setItem('oscar_storage_status_v1', JSON.stringify(detail)); } catch {}
            try { window.dispatchEvent(new CustomEvent('oscar:storage-status', { detail })); } catch {}
            return detail;
        } catch (error) {
            return { supported: false, persisted: false, error: String(error?.message || error) };
        }
    })();
    return storageStatusPromise;
}
function openDB() {
    const wantedTenant = getTenantId();
    if (cachedDB && cachedTenant === wantedTenant) {
        return Promise.resolve(cachedDB);
    }
    if (cachedDB && cachedTenant !== wantedTenant) { try { cachedDB.close(); } catch {} cachedDB = null; dbOpenPromise = null; }
    if (dbOpenPromise) {
        if (openingTenant === wantedTenant) return dbOpenPromise;
        return dbOpenPromise.catch(() => null).then(() => {
            if (cachedDB && cachedTenant !== wantedTenant) { try { cachedDB.close(); } catch {} cachedDB = null; cachedTenant = ''; }
            dbOpenPromise = null;
            openingTenant = '';
            return openDB();
        });
    }
    openingTenant = wantedTenant;
    dbOpenPromise = new Promise((resolve, reject) => {
        try {
            if (typeof window === 'undefined' || !window.indexedDB) throw new Error('IndexedDB is not supported');
            const dbName = dbNameForTenant(wantedTenant);
            let fellBackToExistingVersion = false;
            const wireRequest = (request) => {
                request.onblocked = () => console.warn('IndexedDB version upgrade blocked by another connection');
                request.onerror = () => {
                    // Never downgrade an existing customer database. Older builds used version 6,
                    // while some real installations are already at version 7+. In that case open
                    // the database at its existing version instead of failing with VersionError.
                    if (!fellBackToExistingVersion && request.error?.name === 'VersionError') {
                        fellBackToExistingVersion = true;
                        try { wireRequest(indexedDB.open(dbName)); return; }
                        catch (fallbackError) {
                            dbOpenPromise = null; openingTenant = ''; reject(fallbackError); return;
                        }
                    }
                    dbOpenPromise = null;
                    openingTenant = '';
                    reject(request.error || new Error('Failed to open database'));
                };
                request.onsuccess = () => {
                    cachedDB = request.result;
                    cachedTenant = wantedTenant;
                    openingTenant = wantedTenant;
                    cachedDB.onclose = () => {
                        cachedDB = null;
                        cachedTenant = '';
                        dbOpenPromise = null;
                        openingTenant = '';
                    };
                    cachedDB.onversionchange = () => {
                        cachedDB?.close();
                        cachedDB = null;
                        cachedTenant = '';
                        dbOpenPromise = null;
                        openingTenant = '';
                    };
                    resolve(cachedDB);
                };
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const stores = [
                        'products','categories','warehouses','stock','stock_movements','invoices','purchases','customers','suppliers','partner_statements','accounts','transfers','expenses','shifts','audit_logs','held_invoices','sync_queue','settings','vouchers','employees','restaurant_tables','restaurant_sections','restaurant_orders','kitchen_sections','table_reservations','recipes','waste_records',
                    ];
                    stores.forEach((storeName) => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            if (storeName === 'stock') db.createObjectStore(storeName, { keyPath: ['productId', 'warehouseId'] });
                            else if (storeName === 'settings') db.createObjectStore(storeName, { keyPath: 'key' });
                            else db.createObjectStore(storeName, { keyPath: 'id' });
                        }
                    });
                };
            };
            wireRequest(indexedDB.open(dbName, DB_VERSION));
        } catch (e) {
            dbOpenPromise = null;
            openingTenant = '';
            reject(e);
        }
    });
    return dbOpenPromise;
}
// Cloud sync capture is intentionally kept outside IndexedDB transactions.
function captureCloud(storeName, value, opts={}) {
    try { if (!window.OscarCloudSync?.suppress) return window.OscarCloudSync?.captureStoreChange?.(storeName, value, opts) || Promise.resolve(false); } catch (e) { console.warn('Cloud capture warning', e); }
    return Promise.resolve(false);
}
// Local-first cloud capture scheduler. IndexedDB commits always finish before any
// queue/network work starts. Changes are coalesced and flushed during an idle slice
// so saving invoices stays instant even on 120Hz phones.
const cloudCaptureBuffer = new Map();
let cloudCaptureTimer = null;
function cloudCaptureKey(storeName, value, opts={}) {
    let key = opts?.key;
    if (key === undefined || key === null) {
        if (storeName === 'stock') key = [value?.productId || '', value?.warehouseId || ''];
        else if (storeName === 'settings') key = value?.key || 'store_config';
        else key = value?.id || '';
    }
    return `${storeName}::${JSON.stringify(key)}`;
}
async function flushCloudCaptureBuffer() {
    cloudCaptureTimer = null;
    const entries = [...cloudCaptureBuffer.values()];
    cloudCaptureBuffer.clear();
    for (const entry of entries) {
        const waits = [0, 220, 850, 2200];
        for (let i = 0; i < waits.length; i += 1) {
            if (waits[i]) await new Promise(resolve => setTimeout(resolve, waits[i]));
            try {
                const captured = await captureCloud(entry.storeName, entry.value, entry.opts);
                if (captured !== false) break;
            } catch (e) {
                if (i === waits.length - 1) console.warn('Cloud capture retry warning', e);
            }
        }
    }
    try { window.OscarCloudSync?.requestSync?.(180); } catch {}
}
function scheduleCloudCapture(storeName, value, opts={}) {
    if (typeof window === 'undefined') return;
    let cloudValue = value;
    // Product image bytes selected while offline stay only in local IndexedDB.
    // Turso receives metadata now, then the Telegram file_id on the later automatic update.
    if (storeName === 'products' && cloudValue && typeof cloudValue === 'object' && typeof cloudValue.imageData === 'string' && cloudValue.imageData.startsWith('data:image/')) {
        cloudValue = { ...cloudValue, imageData: '' };
    }
    cloudCaptureBuffer.set(cloudCaptureKey(storeName, cloudValue, opts), { storeName, value: cloudValue, opts });
    if (cloudCaptureTimer) return;
    const run = () => {
        cloudCaptureTimer = setTimeout(() => {
            const job = () => flushCloudCaptureBuffer().catch(e => console.warn('Cloud capture schedule warning', e));
            if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(job, { timeout: 450 });
            else job();
        }, 24);
    };
    run();
}
function broadcastStoreUpdated(storeName) {
    try { if (syncChannel) syncChannel.postMessage({ type: 'STORE_UPDATED', storeName, tenantId: getTenantId() }); } catch {}
}
// Commit many local records atomically in ONE IndexedDB transaction.
// The promise resolves as soon as the local transaction is durable; cloud capture is
// deliberately scheduled afterwards so the UI never waits for network/sync work.
export async function commitLocalBatch(operations = [], notifySync = true) {
    const ops = (Array.isArray(operations) ? operations : []).filter(op => op?.storeName && (op.type === 'put' || op.type === 'delete'));
    if (!ops.length) return { committed: 0, stores: [] };
    const db = await openDB();
    const stores = [...new Set(ops.map(op => op.storeName))];
    const stamp = new Date().toISOString();
    const prepared = ops.map(op => {
        if (op.type !== 'put') return op;
        const value = (op.storeName === 'stock' && notifySync && op.value && typeof op.value === 'object')
            ? { ...op.value, updatedAt: stamp }
            : op.value;
        return { ...op, value };
    });
    return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        for (const op of prepared) {
            const store = tx.objectStore(op.storeName);
            if (op.type === 'delete') store.delete(op.key);
            else store.put(op.value);
        }
        tx.oncomplete = () => {
            // Resolve local save FIRST. Everything below runs later in the event loop.
            resolve({ committed: prepared.length, stores });
            if (!notifySync) return;
            setTimeout(() => {
                const touched = new Set();
                for (const op of prepared) {
                    touched.add(op.storeName);
                    if (op.type === 'delete') scheduleCloudCapture(op.storeName, null, { deleted:true, key:op.key });
                    else scheduleCloudCapture(op.storeName, op.value);
                    try {
                        window.dispatchEvent(new CustomEvent('oscar:db-mutation', { detail: {
                            action: op.actionHint || (op.type === 'delete' ? 'delete' : 'update'),
                            storeName: op.storeName, value: op.type === 'delete' ? (op.before || null) : op.value,
                            before: op.before || null, key: op.key, localBatch:true, at: new Date().toISOString()
                        } }));
                    } catch {}
                }
                touched.forEach(broadcastStoreUpdated);
            }, 0);
        };
        tx.onerror = () => reject(tx.error || new Error('تعذر الحفظ المحلي'));
        tx.onabort = () => reject(tx.error || new Error('تعذر إكمال الحفظ المحلي'));
    });
}

// Generic CRUD operations
function recordKey(storeName, value) {
    if (storeName === 'stock') return [value?.productId, value?.warehouseId];
    if (storeName === 'settings') return value?.key;
    return value?.id;
}
function stableRecord(value) {
    if (value === undefined) return '__undefined__';
    try {
        if (!value || typeof value !== 'object') return JSON.stringify(value);
        const sort = (v) => Array.isArray(v) ? v.map(sort) : (v && typeof v === 'object' ? Object.keys(v).sort().reduce((o,k)=>(o[k]=sort(v[k]),o),{}) : v);
        return JSON.stringify(sort(value));
    } catch { return String(value); }
}
function sameRecord(a, b) { return stableRecord(a) === stableRecord(b); }
export async function getAllFromStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function getFromStore(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function putInStore(storeName, value, notifySync = true) {
    const db = await openDB();
    const key = recordKey(storeName, value);
    const stockStamp = new Date().toISOString();
    let beforeValue = null, changed = true, action = 'add';
    let storedValue = value;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const write = () => {
            storedValue = (storeName === 'stock' && notifySync && value && typeof value === 'object')
                ? { ...value, updatedAt: stockStamp }
                : value;
            store.put(storedValue);
        };
        if (notifySync) {
            const req = store.get(key);
            req.onsuccess = () => {
                beforeValue = req.result ?? null;
                changed = !sameRecord(beforeValue, value);
                action = beforeValue ? 'update' : 'add';
                if (changed) write();
            };
            req.onerror = (event) => { try { event.preventDefault(); event.stopPropagation(); } catch {} beforeValue = null; changed = true; action = 'add'; write(); };
        } else write();
        tx.oncomplete = () => {
            resolve();
            if (notifySync && changed) setTimeout(() => {
                scheduleCloudCapture(storeName, storedValue);
                broadcastStoreUpdated(storeName);
                try {
                    window.dispatchEvent(new CustomEvent('oscar:db-mutation', { detail: {
                        action, storeName, value: storedValue, before: beforeValue, at: new Date().toISOString()
                    } }));
                } catch {}
            }, 0);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error(`تعذر حفظ ${storeName}`));
    });
}
export async function deleteFromStore(storeName, key, notifySync = true) {
    const db = await openDB();
    let beforeValue = null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        if (notifySync) {
            const req = store.get(key);
            req.onsuccess = () => { beforeValue = req.result ?? null; store.delete(key); };
            req.onerror = (event) => { try { event.preventDefault(); event.stopPropagation(); } catch {} store.delete(key); };
        } else store.delete(key);
        tx.oncomplete = () => {
            resolve();
            if (notifySync) setTimeout(() => {
                scheduleCloudCapture(storeName, null, { deleted: true, key });
                broadcastStoreUpdated(storeName);
                try {
                    window.dispatchEvent(new CustomEvent('oscar:db-mutation', { detail: {
                        action: 'delete', storeName, value: beforeValue, before: beforeValue, key, at: new Date().toISOString()
                    } }));
                } catch {}
            }, 0);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error(`تعذر حذف ${storeName}`));
    });
}
export async function clearStore(storeName, notifySync = true) {
    const existing = notifySync ? await getAllFromStore(storeName).catch(() => []) : [];
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => {
            resolve();
            if (notifySync) setTimeout(() => {
                existing.forEach(v => scheduleCloudCapture(storeName, null, { deleted:true, key: storeName === 'stock' ? [v.productId, v.warehouseId] : (storeName === 'settings' ? v.key : v.id) }));
                broadcastStoreUpdated(storeName);
            }, 0);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error(`تعذر مسح ${storeName}`));
    });
}
// Bulk put items
export async function bulkPut(storeName, items, notifySync = true) {
    const rows = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!rows.length) return;
    const db = await openDB();
    const changedItems = [];
    const stamp = new Date().toISOString();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const putChanged = (item) => {
            const stored = (storeName === 'stock' && notifySync && item && typeof item === 'object') ? { ...item, updatedAt: stamp } : item;
            changedItems.push(stored);
            store.put(stored);
        };
        if (!notifySync) rows.forEach(item => store.put(item));
        else rows.forEach(item => {
            const req = store.get(recordKey(storeName, item));
            req.onsuccess = () => { if (!sameRecord(req.result, item)) putChanged(item); };
            req.onerror = (event) => { try { event.preventDefault(); event.stopPropagation(); } catch {} putChanged(item); };
        });
        tx.oncomplete = () => {
            resolve();
            if (notifySync && changedItems.length) setTimeout(() => {
                changedItems.forEach(item => scheduleCloudCapture(storeName, item));
                broadcastStoreUpdated(storeName);
                try {
                    if (changedItems.length <= 25) changedItems.forEach(item => window.dispatchEvent(new CustomEvent('oscar:db-mutation', { detail: { action:'update', storeName, value:item, before:null, bulk:true, at:new Date().toISOString() } })));
                } catch {}
            }, 0);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error(`تعذر حفظ مجموعة ${storeName}`));
    });
}
// Initial default settings
export const DEFAULT_SETTINGS = {
    storeName: 'كاش توب 3',
    subtitle: 'إدارة ذكية',
    phone: '0599-123456',
    address: 'فلسطين - الشارع العام',
    taxNumber: '300987654',
    currency: 'ILS',
    currencySymbol: '₪',
    taxRate: 0,
    theme: 'light',
    printerWidth: '80mm',
    autoPrintReceipt: true,
    printOnSave: true,
    scaleModeEnabled: false,
    receiptShowLogo: true,
    receiptShowStoreInfo: true,
    receiptShowBarcode: true,
    scannerBeepEnabled: true,
    expenseCategories: ['نثريات وضيافة','كهرباء ومياه','إيجار المحل','أجور ورواتب عمال','صيانة ونظافة','بضائع تالفة ومنتهية','أكياس وتغليف وطباعة','نقل وشحن','أخرى'],
    isRestaurantModeEnabled: true,
    restaurantModeDefaultInitialized: true,
    autoPrintKitchenTicket: false,
    kitchenTicketWidth: '80mm',
    kitchenTicketShowPrices: false,
    targetPrepTimeMinutes: 15,
    tableAfterPayment: 'available',
    enableKitchenSoundAlerts: true,
    allowNegativeStock: false,
    warnSellingBelowCost: true,
    receiptFooterMessage: 'شكراً لاستخدام كاش توب 3 - نسعد بخدمتكم دائماً',
    barcodePrefix: '21',
    telegramBotToken: '',
    telegramChatIds: '',
    p2pPaymentChatId: '',
    p2pPaymentMethods: [],
    p2pMethodsManualOnlyV53Initialized: true,
    telegramDailyReportEnabled: false,
    telegramDailyBackupEnabled: true,
    telegramBackupDefaultV45Initialized: true,
    dismissedNotificationIds: [],
    telegramEnabled: true,
    telegramBotUsername: 'Oskarteaam_bot',
    telegramBotUrl: 'http://t.me/Oskarteaam_bot',
    telegramInvoiceNotifications: true,
    telegramPurchaseNotifications: true,
    telegramReturnNotifications: true,
    telegramNotifyCustomers: true,
    telegramNotifySuppliers: true,
    telegramNotifyVouchers: true,
    telegramNotifyExpenses: true,
    telegramNotifyTransfers: true,
    telegramNotifyAccounts: true,
    telegramNotifyProducts: true,
    telegramNotifyInventory: true,
    telegramNotifyWarehouses: true,
    telegramNotifyEmployees: true,
    telegramNotifyShifts: true,
    telegramNotifyHeldInvoices: true,
    telegramNotifyRestaurant: true,
    telegramNotifyAuditLogs: true,
    telegramAutoReportEnabled: true,
    telegramReportIntervalHours: 24,
    telegramSendImages: true,
    telegramRecipients: [],
    activeWarehouseId: 'wh-main',
    activeBranchName: 'الفرع الرئيسي',
    financialYears: [],
    activeFinancialYearId: '',
    financialYearInitializedV48: false,
};
// Initial Warehouses
export const DEFAULT_WAREHOUSES = [
    { id: 'wh-main', name: 'صالة العرض', code: 'SHOWROOM', isDefault: true },
    { id: 'wh-shop', name: 'المخزن الإضافي', code: 'WH-2', isDefault: false },
];
// Initial Categories
export const DEFAULT_CATEGORIES = [
    { id: 'cat-drinks', name: 'مشروبات وعصائر', color: '#0284c7', displayOrder: 1 },
    { id: 'cat-dairy', name: 'ألبان وأجبان', color: '#16a34a', displayOrder: 2 },
    { id: 'cat-food', name: 'مواد غذائية وتموين', color: '#d97706', displayOrder: 3 },
    { id: 'cat-sweets', name: 'حلويات وشوكولاتة', color: '#db2777', displayOrder: 4 },
    { id: 'cat-cleaners', name: 'منظفات وعناية', color: '#7c3aed', displayOrder: 5 },
    { id: 'cat-frozen', name: 'مجمدات ولحوم', color: '#2563eb', displayOrder: 6 },
    { id: 'cat-bakery', name: 'مخبوزات وطحين', color: '#b45309', displayOrder: 7 },
];
// Initial Financial Accounts
export const DEFAULT_ACCOUNTS = [
    { id: 'acc-cash', name: 'الصندوق الرئيسي (الكاش)', type: 'cash', balance: 1500, isDefault: true },
    { id: 'acc-bank', name: 'حساب البنك (فلسطين/العربي)', type: 'bank', balance: 12000, accountNumber: 'PS-1234-5678', isDefault: false },
    { id: 'acc-wallet', name: 'المحفظة الإلكترونية (Jawwal Pay / PalPay)', type: 'wallet', balance: 850, isDefault: false },
    { id: 'acc-card', name: 'جهاز نقاط البيع (فيزا / ماستركارد)', type: 'card', balance: 2400, isDefault: false },
];
// Initial Demo Products demonstrating the Multi-level Unit Tree
export function getDemoProducts() {
    // 1. Mineral water with full 4-level tree: مشطاح -> كرتونة -> باكيت -> حبة
    const waterUnits = calculateUnitConversions([
        {
            id: 'u-water-piece',
            name: 'حبة',
            childUnitId: null,
            multiplier: 1,
            conversionToBase: 1,
            barcodes: ['625100100101'],
            salePrice: 1.5,
            wholesalePrice: 1.2,
            costPrice: 0.9,
            isDefaultSale: true,
        },
        {
            id: 'u-water-pack',
            name: 'باكيت (6 حبات)',
            childUnitId: 'u-water-piece',
            multiplier: 6,
            conversionToBase: 6,
            barcodes: ['625100100106'],
            salePrice: 8.0,
            wholesalePrice: 7.0,
            costPrice: 5.4,
        },
        {
            id: 'u-water-carton',
            name: 'كرتونة (12 باكيت)',
            childUnitId: 'u-water-pack',
            multiplier: 12,
            conversionToBase: 72,
            barcodes: ['625100100112'],
            salePrice: 90.0,
            wholesalePrice: 80.0,
            costPrice: 64.8,
        },
        {
            id: 'u-water-pallet',
            name: 'مشطاح (50 كرتونة)',
            childUnitId: 'u-water-carton',
            multiplier: 50,
            conversionToBase: 3600,
            barcodes: ['625100100150'],
            salePrice: 4200.0,
            wholesalePrice: 3900.0,
            costPrice: 3240.0,
        },
    ], 'u-water-piece');
    // 2. Coca Cola 330ml Can: كرتونة -> درزن -> حبة
    const colaUnits = calculateUnitConversions([
        {
            id: 'u-cola-piece',
            name: 'حبة',
            childUnitId: null,
            multiplier: 1,
            conversionToBase: 1,
            barcodes: ['5449000000996'],
            salePrice: 2.5,
            wholesalePrice: 2.1,
            costPrice: 1.75,
            isDefaultSale: true,
        },
        {
            id: 'u-cola-dozen',
            name: 'درزن (12 حبة)',
            childUnitId: 'u-cola-piece',
            multiplier: 12,
            conversionToBase: 12,
            barcodes: ['5449000000128'],
            salePrice: 28.0,
            wholesalePrice: 24.0,
            costPrice: 21.0,
        },
        {
            id: 'u-cola-carton',
            name: 'كرتونة (24 حبة)',
            childUnitId: 'u-cola-dozen',
            multiplier: 2,
            conversionToBase: 24,
            barcodes: ['5449000000241'],
            salePrice: 54.0,
            wholesalePrice: 48.0,
            costPrice: 42.0,
        },
    ], 'u-cola-piece');
    // 3. Rice (Sugar / Grains): شوال كبير -> كيس 5 كجم -> كيس 1 كجم
    const riceUnits = calculateUnitConversions([
        {
            id: 'u-rice-1kg',
            name: 'كيس 1 كجم',
            childUnitId: null,
            multiplier: 1,
            conversionToBase: 1,
            barcodes: ['625200300101'],
            salePrice: 7.0,
            wholesalePrice: 6.0,
            costPrice: 5.0,
            isDefaultSale: true,
        },
        {
            id: 'u-rice-5kg',
            name: 'كيس 5 كجم',
            childUnitId: 'u-rice-1kg',
            multiplier: 5,
            conversionToBase: 5,
            barcodes: ['625200300105'],
            salePrice: 32.0,
            wholesalePrice: 28.0,
            costPrice: 24.0,
        },
        {
            id: 'u-rice-sack',
            name: 'شوال (25 كجم)',
            childUnitId: 'u-rice-5kg',
            multiplier: 5,
            conversionToBase: 25,
            barcodes: ['625200300125'],
            salePrice: 150.0,
            wholesalePrice: 135.0,
            costPrice: 115.0,
        },
    ], 'u-rice-1kg');
    // 4. Fresh Milk 1L: كرتونة -> حبة
    const milkUnits = calculateUnitConversions([
        {
            id: 'u-milk-piece',
            name: 'حبة',
            childUnitId: null,
            multiplier: 1,
            conversionToBase: 1,
            barcodes: ['625300400101'],
            salePrice: 6.0,
            wholesalePrice: 5.4,
            costPrice: 4.8,
            isDefaultSale: true,
        },
        {
            id: 'u-milk-carton',
            name: 'كرتونة (12 حبة)',
            childUnitId: 'u-milk-piece',
            multiplier: 12,
            conversionToBase: 12,
            barcodes: ['625300400112'],
            salePrice: 68.0,
            wholesalePrice: 62.0,
            costPrice: 57.6,
        },
    ], 'u-milk-piece');
    // 5. Chocolate Biscuit: كرتونة -> باكيت -> حبة
    const biscuitUnits = calculateUnitConversions([
        {
            id: 'u-bisc-piece',
            name: 'حبة',
            childUnitId: null,
            multiplier: 1,
            conversionToBase: 1,
            barcodes: ['625400500101'],
            salePrice: 1.0,
            wholesalePrice: 0.8,
            costPrice: 0.65,
            isDefaultSale: true,
        },
        {
            id: 'u-bisc-pack',
            name: 'باكيت (12 حبة)',
            childUnitId: 'u-bisc-piece',
            multiplier: 12,
            conversionToBase: 12,
            barcodes: ['625400500112'],
            salePrice: 10.0,
            wholesalePrice: 8.5,
            costPrice: 7.5,
        },
        {
            id: 'u-bisc-carton',
            name: 'كرتونة (6 باكيت)',
            childUnitId: 'u-bisc-pack',
            multiplier: 6,
            conversionToBase: 72,
            barcodes: ['625400500172'],
            salePrice: 55.0,
            wholesalePrice: 48.0,
            costPrice: 43.0,
        },
    ], 'u-bisc-piece');
    // 6. Ariel Washing Powder: كرتونة -> كيس
    const arielUnits = calculateUnitConversions([
        {
            id: 'u-ariel-bag',
            name: 'كيس 2.5 كجم',
            childUnitId: null,
            multiplier: 1,
            conversionToBase: 1,
            barcodes: ['625500600101'],
            salePrice: 28.0,
            wholesalePrice: 25.0,
            costPrice: 22.0,
            isDefaultSale: true,
        },
        {
            id: 'u-ariel-carton',
            name: 'كرتونة (4 أكياس)',
            childUnitId: 'u-ariel-bag',
            multiplier: 4,
            conversionToBase: 4,
            barcodes: ['625500600104'],
            salePrice: 105.0,
            wholesalePrice: 95.0,
            costPrice: 86.0,
        },
    ], 'u-ariel-bag');
    return [
        {
            id: 'prod-water',
            name: 'مياه معدنية أروى 500 مل',
            shortName: 'مياه أروى',
            sku: 'WAT-500',
            internalCode: '1001',
            categoryId: 'cat-drinks',
            brand: 'أروى Arwa',
            costPrice: 0.9,
            sellingPrice: 1.5,
            reorderPoint: 200,
            taxRate: 0,
            status: 'active',
            baseUnitId: 'u-water-piece',
            baseUnitName: 'حبة',
            units: waterUnits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: 'prod-cola',
            name: 'كوكاكولا علب 330 مل',
            shortName: 'كولا علب',
            sku: 'COLA-330',
            internalCode: '1002',
            categoryId: 'cat-drinks',
            brand: 'Coca-Cola',
            costPrice: 1.75,
            sellingPrice: 2.5,
            reorderPoint: 100,
            taxRate: 0,
            status: 'active',
            baseUnitId: 'u-cola-piece',
            baseUnitName: 'حبة',
            units: colaUnits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: 'prod-rice',
            name: 'أرز صنوايت كالروز ممتاز',
            shortName: 'أرز صنوايت',
            sku: 'RICE-SUN',
            internalCode: '1003',
            categoryId: 'cat-food',
            brand: 'Sunwhite',
            costPrice: 5.0,
            sellingPrice: 7.0,
            reorderPoint: 50,
            taxRate: 0,
            status: 'active',
            baseUnitId: 'u-rice-1kg',
            baseUnitName: 'كيس 1 كجم',
            units: riceUnits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: 'prod-milk',
            name: 'حليب الجنيدي طازج 1 لتر',
            shortName: 'حليب الجنيدي',
            sku: 'MILK-JND',
            internalCode: '1004',
            categoryId: 'cat-dairy',
            brand: 'الجنيدي',
            costPrice: 4.8,
            sellingPrice: 6.0,
            reorderPoint: 36,
            taxRate: 0,
            status: 'active',
            baseUnitId: 'u-milk-piece',
            baseUnitName: 'حبة',
            units: milkUnits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: 'prod-bisc',
            name: 'بسكويت أوريو شوكولاتة الأصلي',
            shortName: 'أوريو',
            sku: 'OREO-CHOC',
            internalCode: '1005',
            categoryId: 'cat-sweets',
            brand: 'Oreo',
            costPrice: 0.65,
            sellingPrice: 1.0,
            reorderPoint: 120,
            taxRate: 0,
            status: 'active',
            baseUnitId: 'u-bisc-piece',
            baseUnitName: 'حبة',
            units: biscuitUnits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: 'prod-ariel',
            name: 'مسحوق غسيل أوتوماتيك أريال 2.5 كجم',
            shortName: 'أريال 2.5 كجم',
            sku: 'ARL-25',
            internalCode: '1006',
            categoryId: 'cat-cleaners',
            brand: 'Ariel',
            costPrice: 22.0,
            sellingPrice: 28.0,
            reorderPoint: 20,
            taxRate: 0,
            status: 'active',
            baseUnitId: 'u-ariel-bag',
            baseUnitName: 'كيس 2.5 كجم',
            units: arielUnits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ];
}
// Initial stock per warehouse
export function getDemoStock() {
    return [
        { productId: 'prod-water', warehouseId: 'wh-main', baseQuantity: 3780 }, // 1 مشطاح + 2 كرتونة + 6 باكيت
        { productId: 'prod-water', warehouseId: 'wh-shop', baseQuantity: 144 }, // 2 كرتونة
        { productId: 'prod-cola', warehouseId: 'wh-main', baseQuantity: 480 }, // 20 كرتونة
        { productId: 'prod-cola', warehouseId: 'wh-shop', baseQuantity: 72 }, // 3 كرتونة
        { productId: 'prod-rice', warehouseId: 'wh-main', baseQuantity: 250 }, // 10 شوالات
        { productId: 'prod-rice', warehouseId: 'wh-shop', baseQuantity: 25 }, // 5 أكياس 5 كجم
        { productId: 'prod-milk', warehouseId: 'wh-main', baseQuantity: 120 }, // 10 كراتين
        { productId: 'prod-milk', warehouseId: 'wh-shop', baseQuantity: 24 }, // 2 كرتونة
        { productId: 'prod-bisc', warehouseId: 'wh-main', baseQuantity: 720 }, // 10 كراتين
        { productId: 'prod-bisc', warehouseId: 'wh-shop', baseQuantity: 144 }, // 2 كرتونة
        { productId: 'prod-ariel', warehouseId: 'wh-main', baseQuantity: 60 }, // 15 كرتونة
        { productId: 'prod-ariel', warehouseId: 'wh-shop', baseQuantity: 12 }, // 3 كراتين
    ];
}
// Virtual cash customer used only inside the POS. It is never stored in the customers table.
export const CASH_CUSTOMER = Object.freeze({
    id: 'cust-walkin',
    name: 'عميل نقدي',
    phone: '',
    address: '',
    balance: 0,
    priceList: 'retail',
    isVirtual: true,
});
// Initial Demo Customers (registered customers only)
export const DEFAULT_CUSTOMERS = [
    {
        id: 'cust-1',
        name: 'أحمد محمود القواسمي',
        phone: '0599-223344',
        whatsapp: '0599223344',
        address: 'الشارع الرئيسي - عمارة الأمل',
        balance: 450.0, // له دين سابق
        creditLimit: 1500,
        priceList: 'retail',
        notes: 'زبون دائم يسدد نهاية كل شهر',
        createdAt: new Date().toISOString(),
    },
    {
        id: 'cust-2',
        name: 'كافتيريا السلام (جملة)',
        phone: '0568-778899',
        address: 'شارع الجامعة',
        balance: 1200.0,
        creditLimit: 3000,
        priceList: 'wholesale',
        notes: 'يشتري بالكرتونة أسبوعياً',
        createdAt: new Date().toISOString(),
    },
    {
        id: 'cust-3',
        name: 'مها إبراهيم عودة',
        phone: '0598-112233',
        address: 'حي الزيتون',
        balance: 0,
        creditLimit: 500,
        priceList: 'retail',
        createdAt: new Date().toISOString(),
    },
];
// Initial Demo Suppliers
export const DEFAULT_SUPPLIERS = [
    {
        id: 'supp-1',
        name: 'شركة المشروبات الوطنية (كوكاكولا وكابي)',
        phone: '02-2987654',
        address: 'بيتونيا - المنطقة الصناعية',
        companyName: 'المشروبات الوطنية كوكاكولا',
        balance: 3450.0, // نحن مدينون لهم
        notes: 'توريد كل ثلاثاء وخميس',
        createdAt: new Date().toISOString(),
    },
    {
        id: 'supp-2',
        name: 'شركة الجنيدي للألبان والصناعات الغذائية',
        phone: '02-2228899',
        address: 'الخليل - عين سارة',
        companyName: 'الجنيدي',
        balance: 1800.0,
        notes: 'توريد يومي للألبان الطازجة',
        createdAt: new Date().toISOString(),
    },
    {
        id: 'supp-3',
        name: 'شركة الأمل للتجارة العامة والتوزيع',
        phone: '0599-880011',
        address: 'رام الله',
        companyName: 'الأمل للمواد الغذائية',
        balance: 0,
        notes: 'وكيل أرز صنوايت وزيوت',
        createdAt: new Date().toISOString(),
    },
];
// Initial Shift
export const DEFAULT_SHIFT = {
    id: 'shift-1',
    shiftNumber: 1,
    cashierId: 'usr-cashier-1',
    cashierName: 'أبو أحمد (الكاشير الأول)',
    startTime: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    openingCash: 500.0,
    totalCashSales: 1250.0,
    totalOtherSales: 450.0,
    totalCashReturns: 0,
    totalCashExpenses: 50.0,
    expectedCash: 1700.0,
    status: 'open',
};
// Initial Employees
export const DEFAULT_EMPLOYEES = [
    {
        id: 'emp-admin',
        name: 'أحمد القواسمي (المدير العام)',
        phone: '0599-112233',
        role: 'admin',
        roleName: 'مدير عام',
        pin: '1234',
        active: true,
        permissions: {
            canDiscount: true,
            canEditPrice: true,
            canDeleteInvoice: true,
            canDeleteProducts: true,
            canManagePurchases: true,
            canManageVouchers: true,
            canManageInventory: true,
            canViewReports: true,
            canAccessSettings: true,
            canAccessCashier: true,
            canAccessDashboard: true,
            canAccessSales: true,
            canAccessPurchases: true,
            canAccessVouchers: true,
            canAccessEmployees: true,
            canAccessProducts: true,
            canAccessCategories: true,
            canAccessInventory: true,
            canAccessCustomers: true,
            canAccessSuppliers: true,
            canAccessAccounts: true,
            canAccessExpenses: true,
            canAccessBarcodes: true,
            canAccessReports: true,
            canAccessTrash: true,
            canAccessAI: true,
            canAccessRestaurantTables: true,
            canAccessRestaurantWaiter: true,
            canAccessRestaurantKitchen: true,
            canAccessRestaurantOrders: true,
            canAccessRestaurantWaste: true,
        },
        createdAt: new Date().toISOString(),
    },
    {
        id: 'emp-cashier-1',
        name: 'محمود ناصر (كاشير أول)',
        phone: '0599-445566',
        role: 'cashier',
        roleName: 'كاشير',
        pin: '1111',
        active: true,
        permissions: {
            canDiscount: true,
            canEditPrice: false,
            canDeleteInvoice: false,
            canDeleteProducts: false,
            canManagePurchases: false,
            canManageVouchers: true,
            canManageInventory: false,
            canViewReports: false,
            canAccessSettings: false,
            canAccessCashier: true,
            canAccessDashboard: false,
            canAccessSales: true,
            canAccessPurchases: false,
            canAccessVouchers: false,
            canAccessEmployees: false,
            canAccessProducts: false,
            canAccessCategories: false,
            canAccessInventory: false,
            canAccessCustomers: true,
            canAccessSuppliers: false,
            canAccessAccounts: false,
            canAccessExpenses: false,
            canAccessBarcodes: false,
            canAccessReports: false,
            canAccessTrash: false,
            canAccessAI: false,
            canAccessRestaurantTables: false,
            canAccessRestaurantWaiter: false,
            canAccessRestaurantKitchen: false,
            canAccessRestaurantOrders: false,
            canAccessRestaurantWaste: false,
        },
        createdAt: new Date().toISOString(),
    },
    {
        id: 'emp-accountant',
        name: 'سارة رضوان (محاسبة مالية)',
        phone: '0599-778899',
        role: 'accountant',
        roleName: 'محاسب',
        pin: '2222',
        active: true,
        permissions: {
            canDiscount: false,
            canEditPrice: false,
            canDeleteInvoice: true,
            canDeleteProducts: false,
            canManagePurchases: true,
            canManageVouchers: true,
            canManageInventory: true,
            canViewReports: true,
            canAccessSettings: false,
            canAccessCashier: false,
            canAccessDashboard: true,
            canAccessSales: true,
            canAccessPurchases: true,
            canAccessVouchers: true,
            canAccessEmployees: false,
            canAccessProducts: false,
            canAccessCategories: false,
            canAccessInventory: true,
            canAccessCustomers: true,
            canAccessSuppliers: true,
            canAccessAccounts: true,
            canAccessExpenses: true,
            canAccessBarcodes: false,
            canAccessReports: true,
            canAccessTrash: false,
            canAccessAI: false,
            canAccessRestaurantTables: false,
            canAccessRestaurantWaiter: false,
            canAccessRestaurantKitchen: false,
            canAccessRestaurantOrders: false,
            canAccessRestaurantWaste: false,
        },
        createdAt: new Date().toISOString(),
    },
];
// Initial Vouchers
export const DEFAULT_VOUCHERS = [
    {
        id: 'vouch-1',
        voucherNumber: 101,
        type: 'receipt',
        partyType: 'customer',
        partyId: 'cust-1',
        partyName: 'أحمد محمود القواسمي',
        amount: 150.0,
        date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        sourceType: 'account',
        accountId: 'acc-cash',
        accountName: 'الصندوق النقدي الرئيسي (الكاشير)',
        notes: 'دفعة نقدية تحت الحساب',
        userId: 'emp-admin',
        userName: 'أحمد القواسمي',
        createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
        id: 'vouch-2',
        voucherNumber: 102,
        type: 'payment',
        partyType: 'supplier',
        partyId: 'supp-1',
        partyName: 'شركة المشروبات الوطنية كوكاكولا كابي',
        amount: 500.0,
        date: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        sourceType: 'account',
        accountId: 'acc-cash',
        accountName: 'الصندوق النقدي الرئيسي (الكاشير)',
        notes: 'سداد دفعة نقدية من حساب توريد سابق',
        userId: 'emp-admin',
        userName: 'أحمد القواسمي',
        createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    },
];
export async function ensurePrimaryShowroomWarehouse() {
    try {
        const rows = await getAllFromStore('warehouses');
        if (!Array.isArray(rows) || !rows.length) return false;
        const main = rows.find(w => w?.id === 'wh-main') || rows.find(w => w?.isDefault) || rows.find(w => /صالة\s*العرض/.test(String(w?.name || '')));
        if (!main) return false;
        const oldDefaultNames = new Set(['المخزن الرئيسي','المستودع الرئيسي','واجهة المحل (الرفوف)']);
        const next = rows.map(w => ({
            ...w,
            isDefault: w.id === main.id,
            ...(w.id === main.id && (w.id === 'wh-main' || oldDefaultNames.has(String(w.name || ''))) ? { name: 'صالة العرض', code: 'SHOWROOM' } : {})
        }));
        await bulkPut('warehouses', next, false);
        const settings = await getFromStore('settings', 'store_config');
        if (settings && settings.activeWarehouseId !== main.id) await putInStore('settings', { ...settings, activeWarehouseId: main.id }, false);
        return true;
    } catch { return false; }
}

// Seed a NEW company with production-safe empty data only.
// Never inject demo products/customers/suppliers/stock into a real activation key.
export async function seedDatabaseDefaults() {
    const settings = await getFromStore('settings', 'store_config');
    const rt = window.OscarActivation?.readRuntime?.() || {};
    const companyId = String(rt.companyId || '').trim();
    const companyName = String(rt.companyName || '').trim();
    const trialProfile = rt.plan === 'trial' && rt.trialProfile && typeof rt.trialProfile === 'object' ? rt.trialProfile : null;
    if (settings) {
        if (trialProfile) {
            const profileLogo = String(trialProfile.logo || '').trim();
            const next = {
                ...settings,
                ...(!String(settings.storeName || '').trim() && trialProfile.companyName ? { storeName: String(trialProfile.companyName) } : {}),
                ...(!String(settings.address || '').trim() && trialProfile.address ? { address: String(trialProfile.address) } : {}),
                ...(!String(settings.phone || '').trim() && trialProfile.phone ? { phone: String(trialProfile.phone) } : {}),
                ...(!String(settings.currency || '').trim() && trialProfile.currency ? { currency: String(trialProfile.currency) } : {}),
                ...(!String(settings.currencySymbol || '').trim() && trialProfile.currencySymbol ? { currencySymbol: String(trialProfile.currencySymbol) } : {}),
                ...(!String(settings.logoUrl || '').trim() && !String(settings.logoSourceUrl || '').trim() && profileLogo ? { logoUrl: profileLogo, logoSourceUrl: '' } : {}),
            };
            if (JSON.stringify(next) !== JSON.stringify(settings)) {
                await putInStore('settings', next);
                return true;
            }
        }
        return false;
    }
    await putInStore('settings', {
        key: 'store_config',
        ...DEFAULT_SETTINGS,
        ...(companyName ? { storeName: companyName } : {}),
        ...(trialProfile ? {
            storeName: String(trialProfile.companyName || companyName || DEFAULT_SETTINGS.storeName),
            address: String(trialProfile.address || ''),
            phone: String(trialProfile.phone || ''),
            currency: String(trialProfile.currency || DEFAULT_SETTINGS.currency),
            currencySymbol: String(trialProfile.currencySymbol || DEFAULT_SETTINGS.currencySymbol),
            logoUrl: String(trialProfile.logo || ''),
            logoSourceUrl: '',
            activeWarehouseId: 'wh-main',
            activeBranchName: 'الفرع الرئيسي',
        } : {}),
        tenantId: companyId,
        seedMode: trialProfile ? 'trial-empty' : 'production-empty',
    });
    await bulkPut('warehouses', [{ ...DEFAULT_WAREHOUSES[0], isDefault: true }]);
    await bulkPut('accounts', [{ ...DEFAULT_ACCOUNTS[0], balance: 0, isDefault: true }]);
    const account = rt.account || null;
    if (account?.id) {
        await putInStore('employees', {
            ...account,
            id: account.id,
            name: account.name || account.displayName || 'مدير النظام',
            displayName: account.displayName || account.name || 'مدير النظام',
            role: account.role || (rt.type === 'company-manager' ? 'admin' : 'custom'),
            roleName: account.roleName || account.role || (rt.type === 'company-manager' ? 'مدير النظام' : 'موظف'),
            active: account.active !== false,
            system: account.system !== false,
            permissions: account.permissions ?? rt.permissions ?? {},
            createdAt: account.createdAt || new Date().toISOString(),
        });
    }
    await putInStore('audit_logs', {
        id: `log-init-${companyId || Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: account?.id || 'system',
        userName: account?.name || account?.displayName || 'مدير النظام',
        action: 'تهيئة النظام',
        targetType: 'SYSTEM',
        targetId: 'initial_setup',
        details: 'تم بدء قاعدة شركة جديدة فارغة بدون بيانات تجريبية.',
    });
    return true;
}

// Older builds seeded six demo products and sample customers/suppliers into every new key.
// Remove that exact untouched demo pack only when the tenant has no real business activity.
// User-entered data is never cleared or overwritten.
export async function cleanupLegacyDemoSeedIfPristine() {
    try {
        const [products, customers, suppliers, invoices, purchases, movements, transfers, expenses, statements, vouchers] = await Promise.all([
            getAllFromStore('products'), getAllFromStore('customers'), getAllFromStore('suppliers'),
            getAllFromStore('invoices'), getAllFromStore('purchases'), getAllFromStore('stock_movements'),
            getAllFromStore('transfers'), getAllFromStore('expenses'), getAllFromStore('partner_statements'), getAllFromStore('vouchers'),
        ]);
        const demoProductIds = new Set(['prod-water','prod-cola','prod-rice','prod-milk','prod-bisc','prod-ariel']);
        const demoCustomerIds = new Set(['cust-1','cust-2','cust-3']);
        const demoSupplierIds = new Set(['supp-1','supp-2','supp-3']);
        const demoVoucherIds = new Set(['vouch-1','vouch-2']);
        const hasRealActivity = [invoices,purchases,movements,transfers,expenses,statements].some(rows => Array.isArray(rows) && rows.length > 0);
        const hasDemoProducts = Array.isArray(products) && products.some(p => demoProductIds.has(String(p?.id || '')));
        const onlyKnownProducts = Array.isArray(products) && products.every(p => demoProductIds.has(String(p?.id || '')));
        const onlyKnownCustomers = Array.isArray(customers) && customers.every(x => demoCustomerIds.has(String(x?.id || '')));
        const onlyKnownSuppliers = Array.isArray(suppliers) && suppliers.every(x => demoSupplierIds.has(String(x?.id || '')));
        const onlyKnownVouchers = Array.isArray(vouchers) && vouchers.every(x => demoVoucherIds.has(String(x?.id || '')));
        if (hasRealActivity || !hasDemoProducts || !onlyKnownProducts || !onlyKnownCustomers || !onlyKnownSuppliers || !onlyKnownVouchers) return false;

        for (const p of products || []) if (demoProductIds.has(String(p?.id || ''))) await deleteFromStore('products', p.id);
        const stockRows = await getAllFromStore('stock');
        for (const row of stockRows || []) if (demoProductIds.has(String(row?.productId || ''))) await deleteFromStore('stock', [row.productId, row.warehouseId]);
        for (const x of customers || []) if (demoCustomerIds.has(String(x?.id || ''))) await deleteFromStore('customers', x.id);
        for (const x of suppliers || []) if (demoSupplierIds.has(String(x?.id || ''))) await deleteFromStore('suppliers', x.id);
        for (const x of vouchers || []) if (demoVoucherIds.has(String(x?.id || ''))) await deleteFromStore('vouchers', x.id);

        const categories = await getAllFromStore('categories');
        const demoCategoryIds = new Set(['cat-drinks','cat-dairy','cat-food','cat-sweets','cat-cleaners','cat-frozen','cat-bakery']);
        for (const x of categories || []) if (demoCategoryIds.has(String(x?.id || ''))) await deleteFromStore('categories', x.id);
        const shifts = await getAllFromStore('shifts');
        for (const x of shifts || []) if (String(x?.id || '') === 'shift-1') await deleteFromStore('shifts', x.id);
        const audits = await getAllFromStore('audit_logs');
        for (const x of audits || []) if (String(x?.id || '') === 'log-init') await deleteFromStore('audit_logs', x.id);
        const warehouses = await getAllFromStore('warehouses');
        for (const x of warehouses || []) if (String(x?.id || '') === 'wh-shop') await deleteFromStore('warehouses', x.id);

        // Sample accounts contained fake opening balances. Replace only the untouched demo set.
        const accounts = await getAllFromStore('accounts');
        const demoAccountIds = new Set(['acc-cash','acc-bank','acc-wallet','acc-card']);
        const accountsAreDemoOnly = Array.isArray(accounts) && accounts.length > 0 && accounts.every(x => demoAccountIds.has(String(x?.id || '')));
        if (accountsAreDemoOnly) {
            for (const x of accounts) await deleteFromStore('accounts', x.id);
            await putInStore('accounts', { ...DEFAULT_ACCOUNTS[0], balance: 0, isDefault: true });
        }

        // Remove sample employees but keep the real account embedded in the activation file.
        const rt = window.OscarActivation?.readRuntime?.() || {};
        const loginAccount = rt.account || null;
        const employees = await getAllFromStore('employees');
        const demoEmployeeIds = new Set(['emp-admin','emp-cashier-1','emp-accountant']);
        for (const x of employees || []) {
            if (demoEmployeeIds.has(String(x?.id || '')) && String(x?.id || '') !== String(loginAccount?.id || '')) await deleteFromStore('employees', x.id);
        }
        if (loginAccount?.id) {
            await putInStore('employees', {
                ...loginAccount,
                id: loginAccount.id,
                name: loginAccount.name || loginAccount.displayName || 'مدير النظام',
                displayName: loginAccount.displayName || loginAccount.name || 'مدير النظام',
                role: loginAccount.role || (rt.type === 'company-manager' ? 'admin' : 'custom'),
                roleName: loginAccount.roleName || loginAccount.role || (rt.type === 'company-manager' ? 'مدير النظام' : 'موظف'),
                active: loginAccount.active !== false,
                system: loginAccount.system !== false,
                permissions: loginAccount.permissions ?? rt.permissions ?? {},
                createdAt: loginAccount.createdAt || new Date().toISOString(),
            });
        }
        const cfg = await getFromStore('settings', 'store_config');
        if (cfg) await putInStore('settings', { ...cfg, tenantId: String(rt.companyId || ''), seedMode: 'production-empty' });
        return true;
    } catch (error) {
        console.warn('Demo seed cleanup skipped:', error);
        return false;
    }
}

// One-time upgrade path: move the data from the old single-company database
// into the first tenant database only when that tenant is still empty.
export async function migrateLegacyDatabaseIfNeeded() {
    // Disabled intentionally. A legacy single-company database has no trustworthy
    // tenant identity, so automatically copying it into a newly created key can
    // mix one company's data into another. Existing tenant databases are untouched.
    return false;
}

export async function initializeDatabase(options = {}) {
    await openDB();
    enablePersistentLocalStorage().catch(() => {});
    if (!options.deferSeed) await seedDatabaseDefaults();
    await ensurePrimaryShowroomWarehouse().catch(() => {});
    return true;
}
// Reset Database to clean state
export async function resetDatabase(withDemo = false) {
    const stores = [
        'products',
        'categories',
        'warehouses',
        'stock',
        'stock_movements',
        'invoices',
        'purchases',
        'customers',
        'suppliers',
        'partner_statements',
        'accounts',
        'transfers',
        'expenses',
        'shifts',
        'audit_logs',
        'held_invoices',
        'sync_queue',
        'settings',
        'vouchers',
        'employees',
        'restaurant_tables',
        'restaurant_sections',
        'restaurant_orders',
        'kitchen_sections',
        'table_reservations',
        'recipes',
        'waste_records',
    ];
    for (const store of stores) {
        await clearStore(store);
    }
    await putInStore('settings', { key: 'store_config', ...DEFAULT_SETTINGS });
    await bulkPut('warehouses', DEFAULT_WAREHOUSES);
    await bulkPut('categories', DEFAULT_CATEGORIES);
    await bulkPut('accounts', DEFAULT_ACCOUNTS);
    // No virtual cash customer is stored in the customers table.
    await bulkPut('employees', DEFAULT_EMPLOYEES);
    if (withDemo) {
        await bulkPut('customers', DEFAULT_CUSTOMERS);
        await bulkPut('suppliers', DEFAULT_SUPPLIERS);
        await bulkPut('products', getDemoProducts());
        await bulkPut('stock', getDemoStock());
        await bulkPut('vouchers', DEFAULT_VOUCHERS);
        await putInStore('shifts', DEFAULT_SHIFT);
    }
    if (syncChannel) {
        syncChannel.postMessage({ type: 'DATABASE_RESET' });
    }
}
// Export database to JSON
export async function exportDatabaseBackup() {
    const data = {};
    const stores = [
        'products',
        'categories',
        'warehouses',
        'stock',
        'stock_movements',
        'invoices',
        'purchases',
        'customers',
        'suppliers',
        'partner_statements',
        'accounts',
        'transfers',
        'expenses',
        'shifts',
        'audit_logs',
        'settings',
        'vouchers',
        'employees',
        'restaurant_tables',
        'restaurant_sections',
        'restaurant_orders',
        'kitchen_sections',
        'table_reservations',
        'recipes',
        'waste_records',
    ];
    for (const store of stores) {
        data[store] = await getAllFromStore(store);
    }
    return JSON.stringify(data, null, 2);
}
// Import database from JSON
export async function importDatabaseBackup(jsonString) {
    const data = JSON.parse(jsonString);
    for (const store in data) {
        if (Array.isArray(data[store])) {
            await clearStore(store);
            await bulkPut(store, data[store]);
        }
    }
    if (syncChannel) {
        syncChannel.postMessage({ type: 'DATABASE_RESET' });
    }
}
export const db = {
    exportCompleteBackup: async () => {
        const jsonStr = await exportDatabaseBackup();
        return JSON.parse(jsonStr);
    },
    importBackup: async (data) => {
        const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
        await importDatabaseBackup(jsonStr);
    },
    resetToSeedData: async () => {
        await resetDatabase();
    },
};
