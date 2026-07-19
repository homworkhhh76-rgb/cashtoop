# Revision 39 — Secure MongoDB Project API

- إضافة `api/rtdb.js` داخل المشروع ليعمل كوسيط MongoDB Serverless بدلاً من كشف بيانات الاتصال في الواجهة.
- قراءة `MONGODB_URI` و`MONGODB_DB` و`MONGODB_COLLECTION` من Environment Variables فقط.
- عدم تضمين كلمة مرور MongoDB الجديدة أو القديمة في أي ملف واجهة أو ملف إعداد قابل للتنزيل.
- استخدام `/api/rtdb` على نفس نطاق المشروع أولاً عند النشر عبر HTTP/HTTPS، مع fallback مؤقت للـ API السابق للمحافظة على التوافق.
- إضافة طبقة توافق لقراءة بيانات المسارات القديمة والكتابة الجديدة دون حذف البيانات السابقة.
- استثناء `/api/rtdb` من Service Worker Cache ومنع تخزين بيانات MongoDB الحية.
- تحديث Cache First إلى `v49-r39-secure-mongodb-project-api-cache-first`.
- إضافة `.env.example` و`.gitignore` و`vercel.json` بدون أي أسرار.
