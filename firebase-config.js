/* إعدادات قاعدة البيانات الموحدة لكاش توب 2
 * MongoDB Atlas يبقى خلف API وسيط؛ لا يتم وضع MONGODB_URI داخل الواجهة.
 * اسم الكائن والملف محفوظان للتوافق مع بقية صفحات Revision 31.
 */
window.CASHTOP_FIREBASE = Object.freeze({
  enabled: true,
  authMode: 'database-first',
  syncMode: 'mongodb-rtdb-api',
  backendMode: 'mongodb-rtdb-api',
  backendName: 'MongoDB Atlas API',
  rootPath: 'cashTopExchange/cashTopPOS',
  adminRootPath: 'cashTopExchange/cashTopAdmin',
  legacyRootPaths: Object.freeze(['cashTopPOS/v6']),
  config: Object.freeze({
    databaseURL: 'https://cash-top-api-2026.vercel.app/api/rtdb',
    projectId: 'cash-top-api-2026',
    apiKey: ''
  }),
  collections: Object.freeze({ licenses:'licenses', users:'users', companies:'companies' })
});
