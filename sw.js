/**
 * ACL GESTION - Service Worker
 * Cache offline, notifications push, mises a jour automatiques
 */

const CACHE_NAME = 'acl-gestion-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/theme.css',
    '/css/style.css',
    '/css/landing.css',
    '/css/layout.css',
    '/css/dashboard.css',
    '/css/app-polish.css',
    '/js/config.js',
    '/js/app.js',
    '/js/api.js',
    '/js/utils.js',
    '/js/i18n.js',
    '/js/chatbot.js',
    '/js/pages/dashboard.js',
    '/js/pages/hotels.js',
    '/js/pages/housekeeping.js',
    '/js/pages/maintenance.js',
    '/js/pages/linen.js',
    '/js/pages/leaves.js',
    '/js/pages/tasks.js',
    '/js/pages/evaluations.js',
    '/js/pages/audit.js',
    '/js/pages/closures.js',
    '/js/pages/revenue.js',
    '/js/pages/users.js',
    '/js/pages/messages.js',
    '/js/pages/settings.js',
    '/js/pages/notifications.js',
    '/js/pages/rgpd.js',
    '/js/pages/automations.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Installation - cache les fichiers statiques
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('SW: Cache partiel, continuer sans cache complet');
                self.skipWaiting();
            })
    );
});

// Activation - nettoie les anciens caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => clients.claim())
    );
});

// Fetch - Network first pour API, Cache first pour statiques
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ne pas cacher les requetes API
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Hors ligne - verifiez votre connexion'
                }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Ne pas cacher les CDN externes
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache first pour les assets statiques
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) {
                // Mise a jour en arriere-plan (stale-while-revalidate)
                fetch(event.request).then(response => {
                    if (response && response.ok) {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, response);
                        });
                    }
                }).catch(() => {});
                return cached;
            }
            return fetch(event.request).then(response => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        }).catch(() => {
            // Fallback offline pour les pages HTML
            if (event.request.headers.get('accept')?.includes('text/html')) {
                return caches.match('/index.html');
            }
        })
    );
});

// Reception des notifications push
self.addEventListener('push', (event) => {
    let data = { title: 'ACL GESTION', body: 'Nouvelle notification', icon: '/icons/icon-192x192.png' };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body || data.message || 'Nouvelle notification',
        icon: data.icon || '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
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
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
