/*
 * The service worker. It exists for push notifications and nothing else.
 *
 * There is deliberately no `fetch` handler and no cache: this site deploys
 * as a static bundle several times a week, and a service worker that cached
 * it would keep members on a stale build until they force-quit the app. A
 * worker without a fetch handler never sits between the page and the network.
 *
 * Payloads are JSON from scripts/send-notifications.js:
 *   { title, body, url, tag, actions?, tauntUrl? }
 *
 * `actions` is a matchup fact's Taunt button. iOS shows no buttons on web
 * notifications and ignores it; there, tapping the fact opens the same offer
 * through `url`. Where the button shows, pressing it opens `tauntUrl`, which
 * sends the taunt straight away.
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
      actions: Array.isArray(data.actions) ? data.actions : undefined,
      data: { url: data.url || '/', tauntUrl: data.tauntUrl || null }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = event.action === 'taunt' && data.tauntUrl ? data.tauntUrl : data.url || '/';
  const target = new URL(path, self.location.origin).href;

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
