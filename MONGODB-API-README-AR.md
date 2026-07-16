# ربط Revision 31 مع MongoDB Atlas

تم تحويل طبقة المزامنة في هذه الحزمة من Firebase Realtime Database المباشر إلى API وسيط متصل بـ MongoDB Atlas.

## نقطة الاتصال المستخدمة

- API: `https://cash-top-api-2026.vercel.app/api/rtdb`
- نمط الطلب: `GET/PUT/DELETE /api/rtdb?path=<encoded-path>`
- لا يحتوي كود الواجهة على `MONGODB_URI` أو كلمة مرور MongoDB.
- يفترض أن الخادم يقرأ `MONGODB_URI` و `MONGODB_DB` من متغيرات البيئة الخاصة به.

## التوافق

لعدم كسر بيانات Revision 31 أو عزل الشركات، تم الحفاظ على المسارات المنطقية الحالية للتطبيق داخل الـ API:

- بيانات الشركات: `cashTopExchange/cashTopPOS/{tenantId}`
- إدارة الشركات وفهرس المفاتيح: `cashTopExchange/cashTopAdmin`

يقوم محول النقل بتحويل طلبات RTDB القديمة تلقائياً من صيغة `.../path.json` إلى `?path=path` قبل إرسالها إلى MongoDB API.

## الملفات المعدلة

- `firebase-config.js`: نقطة الاتصال أصبحت MongoDB API.
- `firebase-sync.js`: محول API وإلغاء الاعتماد على Firebase Anonymous Auth.
- `login.js`: التحقق من المفتاح وتسجيل الدخول عبر MongoDB API مع fallback لفهرس المفاتيح.
- `admin.js`: إنشاء/تعديل الشركات والمفاتيح عبر MongoDB API، مع تحويل PATCH إلى GET+PUT للتوافق.
- `service-worker.js`: استثناء API الحي من الكاش وتحديث نسخة Cache Storage.

> ملاحظة أمنية: لا تضع رابط `mongodb+srv://...` داخل أي ملف HTML أو JavaScript في الواجهة.
