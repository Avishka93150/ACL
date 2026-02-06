/**
 * ACL GESTION - Service Worker
 * Notifications push et cache basique
 */

const CACHE_NAME = 'acl-gestion-v1';

// Installation
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activation
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Reception des notifications push
self.addEventListener('push', (event) => {
    let data = { title: 'ACL GESTION', body: 'Nouvelle notification', icon: '/favicon.ico' };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body || data.message || 'Nouvelle notification',
        icon: data.icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag: data.tag || 'acl-notification',
        data: {
            url: data.url || '/',
            type: data.type || 'info'
        },
        vibrate: [100, 50, 100],
        requireInteraction: data.type === 'danger' || data.type === 'warning'
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'ACL GESTION', options)
    );
});

// Click sur une notification
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si une fenetre est deja ouverte, la focus
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Sinon ouvrir une nouvelle fenetre
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
