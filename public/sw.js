// Service worker: shows On It's push notifications (payment received, Stripe
// account problems, 2-day unpaid reminders). No fetch handler, no caching.
//
// Every push MUST show a notification: Safari revokes the subscription of a
// site that receives pushes without showing one (userVisibleOnly), so even a
// malformed payload falls back to a generic notification.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'On It', {
      body: data.body || '',
      // iOS ignores icon/badge (it uses the app icon); Android/desktop use them.
      icon: '/icons/manifest-icon-192.maskable.png',
      badge: '/icons/manifest-icon-192.maskable.png',
      // Same tag → the newer notification replaces the older one (e.g. a second
      // payment on the same invoice) instead of stacking.
      tag: data.tag || undefined,
      data: { url: data.url || '/invoices' },
    })
  );
});

// Tap: bring an open On It window forward and send it to the target page;
// only open a new window when none is running. Same-origin paths only.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/';
  const url = new URL(raw, self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin + '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of wins) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        const focused = await client.focus();
        if ('navigate' in focused) {
          await focused.navigate(target);
          return;
        }
      } catch {
        // focus/navigate refused (e.g. an uncontrolled client) — fall through
      }
    }
    await self.clients.openWindow(target);
  })());
});
