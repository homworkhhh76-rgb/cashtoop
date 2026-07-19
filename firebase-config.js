/* إعدادات قاعدة البيانات الموحدة لكاش توب 2
 * نسخة Frontend محمولة: يمكن رفع ملفات المشروع على أي استضافة ثابتة.
 * الواجهة تتصل بخدمة MongoDB HTTPS خارجية واحدة، ولا تحتاج ملف API داخل نفس الاستضافة.
 * لا تضع MongoDB URI أو كلمة المرور في هذا الملف لأن محتواه مرئي للمتصفح.
 */
window.CASHTOP_FIREBASE = Object.freeze({
  enabled: true,
  authMode: 'database-first',
  syncMode: 'mongodb-http-api',
  backendMode: 'mongodb-http-api',
  backendName: 'MongoDB Atlas - External HTTPS Gateway',
  rootPath: 'cashTopExchange/cashTopPOS',
  adminRootPath: 'cashTopExchange/cashTopAdmin',
  legacyRootPaths: Object.freeze(['cashTopPOS/v6']),
  config: Object.freeze({
    // رابط خدمة MongoDB الخارجية. يبقى ثابتاً مهما كانت الاستضافة التي ترفع عليها الواجهة.
    databaseURL: 'https://cash-top-api-2026.vercel.app/api/rtdb',
    projectId: 'cash-top-api-2026',
    apiKey: ''
  }),
  collections: Object.freeze({ licenses:'licenses', users:'users', companies:'companies' })
});
