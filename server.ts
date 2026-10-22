import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import webpush from 'web-push';

const PORT = 3000;
const VAPID_FILE = path.resolve(process.cwd(), '.vapid-keys.json');
const SUBSCRIPTIONS_FILE = path.resolve(process.cwd(), '.push-subscriptions.json');

interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: string;
  username: string;
  groupIds: string[];
  userAgent?: string;
  updatedAt: number;
}

function getOrCreateVapidKeys(): VapidKeyPair {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }

  try {
    if (fs.existsSync(VAPID_FILE)) {
      const raw = fs.readFileSync(VAPID_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as VapidKeyPair;
      if (parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    }
  } catch {
    // Fallback to generating fresh VAPID keys
  }

  const generated = webpush.generateVAPIDKeys();
  const keys: VapidKeyPair = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
  };

  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), 'utf-8');
  } catch {
    // Ignore write error in read-only environments
  }

  return keys;
}

function loadSubscriptions(): Map<string, StoredPushSubscription> {
  const map = new Map<string, StoredPushSubscription>();
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
      const list = JSON.parse(raw) as StoredPushSubscription[];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.endpoint && item.keys?.p256dh && item.keys?.auth) {
            map.set(item.endpoint, item);
          }
        }
      }
    }
  } catch {
    // Ignore corrupt file
  }
  return map;
}

function saveSubscriptions(map: Map<string, StoredPushSubscription>) {
  try {
    const list = Array.from(map.values());
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {
    // Ignore write error
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const vapidKeys = getOrCreateVapidKeys();
  webpush.setVapidDetails(
    'mailto:notificaciones@jesustone.app',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  const subscriptions = loadSubscriptions();

  // 1. Obtener llave pública VAPID para PushManager.subscribe
  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({
      publicKey: vapidKeys.publicKey,
    });
  });

  // 2. Consultar estado de suscripción de un usuario
  app.get('/api/push/status', (req, res) => {
    const userId = String(req.query.userId || '');
    const userSubs = Array.from(subscriptions.values()).filter(
      (s) => !userId || s.userId === userId
    );
    res.json({
      configured: true,
      publicKey: vapidKeys.publicKey,
      subscriptionsCount: userSubs.length,
    });
  });

  // 3. Registrar o actualizar suscripción Push de un dispositivo
  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, userId, username, groupIds, userAgent } = req.body || {};

    if (
      !subscription ||
      typeof subscription.endpoint !== 'string' ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      res.status(400).json({ error: 'Invalid PushSubscription object' });
      return;
    }

    const record: StoredPushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userId: String(userId || 'anonymous'),
      username: String(username || 'musico'),
      groupIds: Array.isArray(groupIds) ? groupIds.map(String) : [],
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      updatedAt: Date.now(),
    };

    subscriptions.set(record.endpoint, record);
    saveSubscriptions(subscriptions);

    res.json({
      ok: true,
      endpoint: record.endpoint,
      totalUserDevices: Array.from(subscriptions.values()).filter(
        (s) => s.userId === record.userId
      ).length,
    });
  });

  // 4. Cancelar suscripción Push de un dispositivo
  app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint, userId } = req.body || {};
    let removed = 0;

    if (typeof endpoint === 'string' && subscriptions.has(endpoint)) {
      subscriptions.delete(endpoint);
      removed++;
    } else if (typeof userId === 'string' && userId) {
      for (const [ep, sub] of subscriptions.entries()) {
        if (sub.userId === userId) {
          subscriptions.delete(ep);
          removed++;
        }
      }
    }

    if (removed > 0) {
      saveSubscriptions(subscriptions);
    }

    res.json({ ok: true, removed });
  });

  // 5. Enviar notificación Web Push real (RFC 8030) a los dispositivos suscritos
  app.post('/api/push/send', async (req, res) => {
    const {
      notifications,
      senderUserId,
      includeSender = false,
    } = req.body || {};

    const items = Array.isArray(notifications)
      ? notifications
      : req.body?.title
      ? [req.body]
      : [];

    if (items.length === 0) {
      res.status(400).json({ error: 'No notification payload provided' });
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    const staleEndpoints: string[] = [];

    for (const item of items) {
      const recipientUserId = String(item.recipientUserId || 'all');
      const groupId = String(item.groupId || '');

      const targetSubs = Array.from(subscriptions.values()).filter((sub) => {
        if (!includeSender && senderUserId && sub.userId === senderUserId && recipientUserId === 'all') {
          return false;
        }
        if (recipientUserId !== 'all') {
          return sub.userId === recipientUserId;
        }
        if (groupId && sub.groupIds.length > 0) {
          return sub.groupIds.includes(groupId);
        }
        return true;
      });

      const pushPayload = JSON.stringify({
        id: item.id || `push-${Date.now()}`,
        title: `jesustone · ${item.title || 'Nueva alerta'}`,
        body: item.message || item.body || 'Tienes un nuevo aviso en jesustone.',
        category: item.category || 'general',
        groupId: item.groupId || '',
        groupName: item.groupName || 'jesustone',
        targetTab: item.targetTab || 'inicio',
        targetId: item.targetId || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
      });

      await Promise.all(
        targetSubs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: sub.keys,
              },
              pushPayload,
              {
                TTL: 86400,
                urgency: 'high',
              }
            );
            sentCount++;
          } catch (err: unknown) {
            failedCount++;
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              staleEndpoints.push(sub.endpoint);
            }
          }
        })
      );
    }

    if (staleEndpoints.length > 0) {
      staleEndpoints.forEach((ep) => subscriptions.delete(ep));
      saveSubscriptions(subscriptions);
    }

    res.json({
      ok: true,
      sentCount,
      failedCount,
      prunedCount: staleEndpoints.length,
    });
  });

  // 6. Enviar Push de Prueba inmediata al dispositivo del usuario actual
  app.post('/api/push/test', async (req, res) => {
    const { userId, username, endpoint } = req.body || {};

    const targetSubs = Array.from(subscriptions.values()).filter((sub) => {
      if (endpoint && sub.endpoint === endpoint) return true;
      if (userId && sub.userId === userId) return true;
      return false;
    });

    if (targetSubs.length === 0) {
      res.status(404).json({
        ok: false,
        error: 'No se encontró una suscripción Push activa en este dispositivo.',
      });
      return;
    }

    const payload = JSON.stringify({
      id: `test-push-${Date.now()}`,
      title: 'jesustone · Push Nativa Activa 🔔',
      body: `¡Hola @${username || 'musico'}! Las notificaciones push en segundo plano están configuradas correctamente en tu dispositivo.`,
      category: 'new_event',
      targetTab: 'eventos',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
    });

    let sent = 0;
    const staleEndpoints: string[] = [];

    await Promise.all(
      targetSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload,
            {
              TTL: 3600,
              urgency: 'high',
            }
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      staleEndpoints.forEach((ep) => subscriptions.delete(ep));
      saveSubscriptions(subscriptions);
    }

    res.json({
      ok: sent > 0,
      sentCount: sent,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`jesustone server + Web Push running on http://localhost:${PORT}`);
  });
}

startServer();
