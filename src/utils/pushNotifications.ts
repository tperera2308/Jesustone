import { AppNotification, NavigationTab } from '../types';

export interface PushNavigationPayload {
  url?: string;
  targetTab?: NavigationTab;
  targetId?: string;
  groupId?: string;
  category?: string;
  notificationId?: string;
}

export interface PushSubscriptionStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  serviceWorkerReady: boolean;
  subscribed: boolean;
  endpoint?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Asegura que el Service Worker de jesustone esté registrado y activo
 * para escuchar eventos 'push' y 'notificationclick'.
 */
export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      return existing;
    }
    const reg = await navigator.serviceWorker.register('/push-sw.js', {
      scope: '/',
    });
    return reg;
  } catch {
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      return null;
    }
  }
}

/**
 * Obtiene el estado actual de soporte, permisos, Service Worker y suscripción Push.
 */
export async function getPushSubscriptionState(): Promise<PushSubscriptionStatus> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    typeof Notification === 'undefined'
  ) {
    return {
      supported: false,
      permission: 'unsupported',
      serviceWorkerReady: false,
      subscribed: false,
    };
  }

  try {
    const reg = await ensurePushServiceWorker();
    if (!reg) {
      return {
        supported: true,
        permission: Notification.permission,
        serviceWorkerReady: false,
        subscribed: false,
      };
    }

    const sub = await reg.pushManager.getSubscription();
    return {
      supported: true,
      permission: Notification.permission,
      serviceWorkerReady: Boolean(reg.active || reg.waiting || reg.installing),
      subscribed: Boolean(sub),
      endpoint: sub?.endpoint,
    };
  } catch {
    return {
      supported: true,
      permission: Notification.permission,
      serviceWorkerReady: false,
      subscribed: false,
    };
  }
}

/**
 * Suscribe este dispositivo a Notificaciones Push Nativas (Web Push RFC 8030)
 */
export async function subscribeDeviceToWebPush(params: {
  userId: string;
  username: string;
  groupIds: string[];
}): Promise<{ ok: boolean; message: string; endpoint?: string }> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    typeof Notification === 'undefined'
  ) {
    return {
      ok: false,
      message:
        'Tu navegador actual no permite notificaciones directas. En iPhone o iPad, agrega primero la aplicación a tu pantalla de inicio.',
    };
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return {
        ok: false,
        message:
          'Permiso de notificaciones desactivado en tu navegador. Actívalo en los ajustes para recibir avisos.',
      };
    }

    const reg = await ensurePushServiceWorker();
    if (!reg) {
      return {
        ok: false,
        message: 'No se pudieron preparar las notificaciones en este navegador.',
      };
    }

    // Obtener llave pública VAPID del servidor
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      throw new Error('No se pudo conectar con el servidor de notificaciones.');
    }
    const { publicKey } = (await keyRes.json()) as { publicKey: string };

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subJson,
        userId: params.userId,
        username: params.username,
        groupIds: params.groupIds,
        userAgent: navigator.userAgent,
      }),
    });

    if (!saveRes.ok) {
      throw new Error('No se pudo guardar tu preferencia de notificaciones.');
    }

    return {
      ok: true,
      message:
        '¡Notificaciones activadas! Recibirás avisos de eventos y mensajes en tu dispositivo.',
      endpoint: subscription.endpoint,
    };
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'No se pudieron activar las notificaciones.';
    return {
      ok: false,
      message: msg,
    };
  }
}

/**
 * Sincroniza silenciosamente la suscripción existente cuando cambia el usuario o sus grupos
 */
export async function syncExistingPushSubscription(params: {
  userId: string;
  username: string;
  groupIds: string[];
}): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    const reg = await ensurePushServiceWorker();
    if (!reg) return;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userId: params.userId,
        username: params.username,
        groupIds: params.groupIds,
        userAgent: navigator.userAgent,
      }),
    });
  } catch {
    // Ignore background sync errors
  }
}

/**
 * Desactiva la suscripción Push de este dispositivo
 */
export async function unsubscribeDeviceFromWebPush(
  userId?: string
): Promise<{ ok: boolean; message: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, message: 'No disponible en este navegador.' };
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint;

    if (sub) {
      await sub.unsubscribe();
    }

    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, userId }),
    });

    return {
      ok: true,
      message: 'Notificaciones desactivadas en este dispositivo.',
    };
  } catch {
    return {
      ok: false,
      message: 'No se pudieron desactivar las notificaciones.',
    };
  }
}

/**
 * Muestra una notificación nativa del sistema operativo a través del Service Worker activo
 */
export async function showNativeNotificationViaSW(
  notif: Pick<
    AppNotification,
    'id' | 'title' | 'message' | 'category' | 'groupId' | 'groupName' | 'targetTab' | 'targetId'
  >
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  try {
    const reg = await ensurePushServiceWorker();
    if (reg && 'showNotification' in reg) {
      const queryParams = new URLSearchParams();
      if (notif.targetTab) queryParams.set('tab', notif.targetTab);
      if (notif.groupId) queryParams.set('groupId', notif.groupId);
      if (notif.targetId) queryParams.set('targetId', notif.targetId);

      await reg.showNotification(`jesustone · ${notif.title}`, {
        body: notif.message,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `${notif.category}-${notif.targetId || notif.id}`,
        data: {
          url: `/?${queryParams.toString()}`,
          targetTab: notif.targetTab,
          targetId: notif.targetId,
          groupId: notif.groupId,
          category: notif.category,
          notificationId: notif.id,
        },
      });
      return true;
    }
  } catch {
    // Fallback to Notification constructor below
  }

  try {
    new Notification(`jesustone · ${notif.title}`, {
      body: notif.message,
      icon: '/pwa-192x192.png',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Envía notificaciones Web Push reales (vía backend VAPID) a los dispositivos de los destinatarios
 * para que les lleguen aunque tengan la app cerrada.
 */
export async function sendWebPushToRecipients(
  notifications: AppNotification[],
  senderUserId?: string
): Promise<void> {
  if (!notifications || notifications.length === 0) return;

  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notifications,
        senderUserId,
        includeSender: false,
      }),
    });
  } catch {
    // Ignore if offline
  }
}

/**
 * Envía una notificación Push de prueba real desde el servidor al dispositivo actual
 */
export async function sendTestPushNotification(params: {
  userId: string;
  username: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const reg = await ensurePushServiceWorker();
    const sub = await reg?.pushManager.getSubscription();

    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        username: params.username,
        endpoint: sub?.endpoint,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; sentCount: number };
      if (data.ok && data.sentCount > 0) {
        return {
          ok: true,
          message:
            '¡Notificación Push enviada desde el servidor! Revisa la barra de estado de tu dispositivo.',
        };
      }
    }

    // Fallback directo vía Service Worker si el navegador bloqueó el túnel push en iframe
    const shown = await showNativeNotificationViaSW({
      id: `test-sw-${Date.now()}`,
      title: 'Push Nativa Activa 🔔',
      message: `¡Hola @${params.username}! El Service Worker de jesustone está listo para entregar alertas de eventos y mensajes.`,
      category: 'new_event',
      groupId: '',
      groupName: 'jesustone',
      targetTab: 'eventos',
    });

    if (shown) {
      return {
        ok: true,
        message:
          '¡Alerta nativa disparada por el Service Worker! Revisa tus notificaciones del sistema.',
      };
    }

    return {
      ok: false,
      message:
        'Activa primero las Notificaciones Push en este dispositivo para probar el envío.',
    };
  } catch {
    return {
      ok: false,
      message: 'No se pudo enviar la notificación de prueba.',
    };
  }
}
