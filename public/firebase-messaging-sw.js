/* eslint-disable no-undef */
// Firebase Cloud Messaging & Native Background Push Service Worker for Gastro Smart
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "deductive-enterprise-498sv",
  appId: "1:408750157622:web:91ee9e1de6bb73559b4d97",
  apiKey: "AIzaSyCcaXSew_B-ghngI8RQPvVmt5MuS3pGUWg",
  authDomain: "deductive-enterprise-498sv.firebaseapp.com",
  storageBucket: "deductive-enterprise-498sv.firebasestorage.app",
  messagingSenderId: "408750157622"
};

try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const messaging = firebase.messaging();

  // Handler para mensajes push de FCM cuando la app está en segundo plano o cerrada
  messaging.onBackgroundMessage((payload) => {
    const notificationTitle =
      payload?.notification?.title ||
      payload?.data?.title ||
      '🔔 Nuevo Pedido en Gastro Smart';

    const notificationOptions = {
      body:
        payload?.notification?.body ||
        payload?.data?.body ||
        'Tienes una nueva alerta de pedido pendiente de atención.',
      icon: payload?.notification?.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload?.data?.tag || payload?.data?.orderId || 'gastro-smart-push-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      vibrate: [220, 100, 220, 100, 350],
      data: {
        url: payload?.data?.url || '/',
        orderId: payload?.data?.orderId || null,
        type: payload?.data?.type || 'new_order',
        ...(payload?.data || {})
      },
      actions: [
        {
          action: 'open_order',
          title: 'Ver Pedido'
        },
        {
          action: 'dismiss',
          title: 'Marcar Leído'
        }
      ]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (err) {
  console.warn('[firebase-messaging-sw] Advertencia al inicializar FCM compat:', err);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Soporte directo para mensajes enviados desde el cliente (cuando la pestaña/TWA pasa a segundo plano)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NATIVE_NOTIFICATION') {
    const { title, body, tag, orderId, notifType, url } = event.data.payload || {};
    const notificationTitle = title || '🔔 Alerta Gastro Smart';
    const notificationOptions = {
      body: body || 'Nueva actualización de pedido en tiempo real.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: tag || (orderId ? `order-${orderId}-${notifType || 'alert'}` : `gastro-${Date.now()}`),
      renotify: true,
      requireInteraction: true,
      vibrate: [220, 100, 220, 100, 350],
      data: {
        url: url || '/',
        orderId: orderId || null,
        type: notifType || 'new_order'
      },
      actions: [
        {
          action: 'open_order',
          title: 'Ver en App'
        },
        {
          action: 'dismiss',
          title: 'Silenciar'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(notificationTitle, notificationOptions)
    );
  }
});

// Gestionar el clic del personal sobre la notificación nativa del sistema operativo
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};

  if (event.action === 'dismiss') {
    // Notificar al cliente que silencie la alarma correspondiente si está abierto
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        windowClients.forEach((client) => {
          client.postMessage({
            type: 'NOTIFICATION_DISMISSED',
            orderId: notifData.orderId || null,
            notifType: notifData.type || null
          });
        });
      })
    );
    return;
  }

  const targetUrl = notifData.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            orderId: notifData.orderId || null,
            notifType: notifData.type || null
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
