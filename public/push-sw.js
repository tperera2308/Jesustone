/* eslint-disable no-restricted-globals */
/**
 * jesustone — Service Worker de Notificaciones Push Nativas (Web Push API + OS Notifications)
 * Permite recibir alertas de eventos, convocatorias de suplentes, canciones y mensajes directos
 * incluso cuando la PWA está en segundo plano o completamente cerrada.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Construye las opciones estándar de una notificación nativa de jesustone
 */
function buildNotificationOptions(payload) {
  const category = payload.category || 'general';
  const groupId = payload.groupId || '';
  const targetTab = payload.targetTab || 'inicio';
  const targetId = payload.targetId || '';
  const notificationId = payload.id || `push-${Date.now()}`;

  const queryParams = new URLSearchParams();
  if (targetTab) queryParams.set('tab', targetTab);
  if (groupId) queryParams.set('groupId', groupId);
  if (targetId) queryParams.set('targetId', targetId);
  if (notificationId) queryParams.set('notifId', notificationId);

  const targetUrl =
    payload.url || `/?${queryParams.toString()}`;

  return {
    body: payload.body || payload.message || 'Tienes una nueva actualización en jesustone.',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: payload.tag || `${category}-${targetId || notificationId}`,
    renotify: true,
    vibrate: [180, 80, 180],
    requireInteraction:
      category === 'role_assigned' ||
      category === 'guest_event_invite' ||
      category === 'new_event',
    data: {
      url: targetUrl,
      targetTab,
      targetId,
      groupId,
      category,
      notificationId,
      timestamp: Date.now(),
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir en jesustone',
      },
      {
        action: 'dismiss',
        title: 'Cerrar',
      },
    ],
  };
}

/**
 * Listener principal de eventos Web Push (RFC 8030) enviados desde el servidor
 * Funciona cuando la aplicación está cerrada o en segundo plano.
 */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'jesustone · Alabanza',
    body: 'Tienes un nuevo aviso de tu banda en jesustone.',
    category: 'general',
    targetTab: 'inicio',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      const rawText = event.data.text();
      if (rawText) {
        payload.body = rawText;
      }
    }
  }

  const title = payload.title || 'jesustone';
  const options = buildNotificationOptions(payload);

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Listener para mostrar notificaciones nativas solicitadas desde el cliente vía postMessage
 */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'SHOW_NATIVE_NOTIFICATION' && event.data.payload) {
    const payload = event.data.payload;
    const title = payload.title || 'jesustone';
    const options = buildNotificationOptions(payload);
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

/**
 * Al tocar la notificación nativa en Android / iOS / Desktop:
 * 1. Si la PWA ya está abierta en segundo plano, la enfoca y navega a la pestaña/evento/chat.
 * 2. Si la PWA estaba cerrada, la abre directamente en la sección correspondiente.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'PUSH_NOTIFICATION_CLICK',
              payload: notifData,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
