# ربط Revision 31 مع MongoDB Atlas

تم تحويل طبقة المزامنة في هذه الحزمة من Firebase Realtime Database المباشر إلى API وسيط متصل بـ MongoDB Atlas.

## نقطة الاتصال المستخدمة

- API الأساسي في Revision 39: `/api/rtdb` داخل نفس المشروع المنشور.
- API القديم `https://cash-top-api-2026.vercel.app/api/rtdb` بقي كـ fallback مؤقت للتوافق.
- نمط الطلب: `GET/PUT/DELETE /api/rtdb?path=<encoded-path>`
- لا يحتوي كود الواجهة على `MONGODB_URI` أو كلمة مرور MongoDB.
- الخادم الموجود في `api/rtdb.js` يقرأ `MONGODB_URI` و `MONGODB_DB` و `MONGODB_COLLECTION` من متغيرات البيئة الخاصة بالاستضافة.

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

## تحسينات المزامنة في Revision 32

- العمليات المحلية المعلقة تبقى في طابور دائم مرتبط بـ `tenantId`، مع نسخة احتياطية في IndexedDB.
- عند عودة الاتصال تتم مزامنة العمليات تلقائياً، بما في ذلك بعد إعادة فتح الجهاز.
- الكتابة عبر MongoDB API تتم على مستوى `datasets/<key>` بدلاً من استبدال عقدة الشركة كاملة عند كل تعديل.
- عند وجود تعديلات من أكثر من جهاز يتم دمج السجلات/الحقول التي يمكن تحديدها، ثم التحقق من نتيجة الكتابة وإعادة المحاولة عند التعارض.
- طلبات MongoDB API مستثناة بالكامل من Service Worker Cache؛ الكاش مخصص لملفات وصفحات التطبيق فقط.

## تحديث Revision 41
عند استضافة التطبيق مع مجلد `api` في نفس مشروع Vercel، تستخدم الواجهة تلقائياً `/api/rtdb` من نفس النطاق أولاً. عند فتح التطبيق خارج الاستضافة يوجد رابط API خارجي مجرب كخطة بديلة. لا تضع `MONGODB_URI` داخل HTML أو JavaScript؛ يبقى داخل Environment Variables فقط.
