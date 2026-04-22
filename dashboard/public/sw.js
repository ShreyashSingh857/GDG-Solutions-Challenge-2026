self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};

  event.waitUntil(
    self.registration.showNotification(data.title || 'Supply Chain Alert', {
      body: data.body || 'A disruption has been detected.',
      icon: '/globe.svg',
      badge: '/globe.svg',
      data: { url: data.url || '/' },
      actions: [
        { action: 'view', title: 'View Options' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(clients.openWindow(event.notification?.data?.url || '/'));
});
