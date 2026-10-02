/*
 * The service worker. It exists for push notifications and nothing else.
 *
 * There is deliberately no `fetch` handler and no cache: this site deploys
 * as a static bundle several times a week, and a service worker that cached
 * it would keep members on a stale build until they force-quit the app. A
 * worker without a fetch handler never sits between the page and the network.
 *
 * Payloads are JSON from scripts/send-notifications.js:
 *   { title, body, url, tag }
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'OG Jits';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // The same tag replaces rather than stacks: a re-sent reminder is one
      // notification on the lock screen, not two.
      tag: data.tag || undefined,
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
