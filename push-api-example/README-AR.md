# API إشعارات Push لكاش توب

هذه الملفات مثال لخدمة Vercel/Node ترسل Web Push بدون تخزين محتوى الإشعارات. الذي يُخزن فقط هو Push Subscription للأجهزة حتى يمكن الوصول إليها بالخلفية.

المتغيرات المطلوبة على الخادم: `MONGODB_URI`, `MONGODB_DB`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_ADMIN_SECRET`.

بعد نشر `subscribe.js` و`send.js` كمساري `/api/push/subscribe` و`/api/push/send` ضع VAPID Public Key في `push-config.js`.
