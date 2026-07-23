self.addEventListener('notificationclick', function(event) {
    // إغلاق الإشعار فور الضغط عليه
    event.notification.close();

    // جلب الرابط المرفق مع الإشعار وفتحه
    const urlToOpen = event.notification.data.url;
    
    if (urlToOpen) {
        event.waitUntil(
            clients.openWindow(urlToOpen)
        );
    }
});
