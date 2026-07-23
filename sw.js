self.addEventListener('notificationclick', function(event) {
    // إغلاق الإشعار فور الضغط عليه
    event.notification.close();

    // جلب الروابط التي مررناها من ملف HTML
    const data = event.notification.data;
    let targetUrl = data.mainUrl; // الرابط الافتراضي عند الضغط على جسم الإشعار

    // التحقق مما إذا كان المستخدم قد ضغط على أحد الأزرار
    if (event.action === 'btn1' && data.btn1Url) {
        targetUrl = data.btn1Url;
    } else if (event.action === 'btn2' && data.btn2Url) {
        targetUrl = data.btn2Url;
    }

    // إذا كان هناك رابط فعلي، قم بفتح نافذة المتصفح عليه
    if (targetUrl) {
        event.waitUntil(
            clients.openWindow(targetUrl)
        );
    }
});
