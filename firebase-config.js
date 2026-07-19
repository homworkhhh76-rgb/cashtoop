/* إعدادات قاعدة البيانات الموحدة لكاش توب 2
 * Revision 41: عند تشغيل التطبيق من الاستضافة، تتم المزامنة أولاً عبر /api/rtdb
 * من نفس النطاق حتى لا تعتمد الواجهة على دومين وسيط مختلف أو CORS. عند فتح الملفات
 * خارج الاستضافة يتم استخدام رابط الـ API الجديد الذي تم اختباره بنجاح، مع إبقاء
 * رابط فرع main والرابط القديم كخطط احتياطية. لا توجد أي بيانات اعتماد في الواجهة.
 */
(() => {
  'use strict';
  const hosted = typeof location !== 'undefined' && ['http:', 'https:'].includes(location.protocol) && location.origin && location.origin !== 'null';
  const localProjectApi = hosted ? `${location.origin}/api/rtdb` : '';
  // رابط Deployment الذي تم اختباره فعلياً وأعاد null لمسار اختبار صالح.
  const verifiedApi = 'https://cashtop-2bblxfx4i-cashtop.vercel.app/api/rtdb';
  // Alias فرع main يبقى احتياطياً حتى يتابع أحدث نشر للفرع إن كان متاحاً.
  const mainBranchApi = 'https://cashtop-git-main-cashtop.vercel.app/api/rtdb';
  const legacyApi = 'https://cash-top-api-2026.vercel.app/api/rtdb';
  const primaryApi = localProjectApi || verifiedApi;
  const fallbackApis = [verifiedApi, mainBranchApi, legacyApi]
    .filter(Boolean)
    .filter((value, index, list) => value !== primaryApi && list.indexOf(value) === index);

  window.CASHTOP_FIREBASE = Object.freeze({
    enabled: true,
    authMode: 'database-first',
    syncMode: 'mongodb-rtdb-api',
    backendMode: 'mongodb-rtdb-api',
    backendName: 'MongoDB Project API',
    rootPath: 'cashTopExchange/cashTopPOS',
    adminRootPath: 'cashTopExchange/cashTopAdmin',
    legacyRootPaths: Object.freeze(['cashTopPOS/v6']),
    config: Object.freeze({
      databaseURL: primaryApi,
      fallbackDatabaseURLs: Object.freeze(fallbackApis),
      projectId: 'cash-top-secure-r41',
      apiKey: ''
    }),
    collections: Object.freeze({ licenses:'licenses', users:'users', companies:'companies' })
  });
})();
