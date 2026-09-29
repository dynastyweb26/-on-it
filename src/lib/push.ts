// Client-side web-push helpers: payment alerts, Stripe account alerts, and the
// 2-day unpaid reminders all share one subscription per device. One place for
// subscribe/unsubscribe so the chat prompt and the Settings toggle can't drift.
//
// Saving goes through /api/push/subscribe (never a direct table write): the
// route ties the device to whoever is signed in now and tags it with this
// deployment's environment.

/** What this device can do about push right now (synchronous, no prompt):
 *   ready         — push works here; asking is allowed
 *   needs-install — iPhone/iPad in a Safari tab: web push exists only for a
 *                   Home Screen install (iOS 16.4+)
 *   denied        — the user blocked notifications for On It
 *   unsupported   — this browser has no web push at all */
export type PushAvailability = 'ready' | 'needs-install' | 'denied' | 'unsupported';

export function pushAvailability(): PushAvailability {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return ios && !installed ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    // Registered at app load (chat page); register() on an already-registered
    // script is a no-op that resolves immediately.
    await navigator.serviceWorker.register('/sw.js');
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** The browser's current push subscription, if any. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Ask permission, subscribe, and save the subscription for the signed-in
 *  user. MUST be called straight from a tap handler: iOS only shows the
 *  permission prompt for a user gesture, so requestPermission() is the FIRST
 *  thing this does — nothing is awaited before it. */
export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return false;
  }
  if (permission !== 'granted') return false;

  const reg = await registration();
  if (!reg) return false;
  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      }));
    const json = sub.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch {
    return false; // push unsupported, key missing, or the save failed
  }
}

/** Unsubscribe this browser and forget the device server-side. Called by the
 *  Settings toggle and on sign-out (so a shared phone stops getting the
 *  previous account's alerts). */
export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getPushSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  } catch { /* the row is also dropped on the next 404/410 */ }
  try {
    await sub.unsubscribe();
  } catch {
    return false;
  }
  return true;
}
