// Client-side web-push helpers for the 2-day payment follow-ups.
// One place for subscribe/unsubscribe so the chat prompt and the
// Settings toggle can't drift apart.
import type { SupabaseClient } from '@supabase/supabase-js';

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    await navigator.serviceWorker.register('/sw.js');
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** The browser's current push subscription, if any. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  const reg = await readyRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Ask permission, subscribe, and persist the subscription row. */
export async function subscribeToPush(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const reg = await readyRegistration();
  if (!reg) return false;
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      { onConflict: 'endpoint' }
    );
    return !error;
  } catch {
    return false; // permission denied or push unsupported
  }
}

/** Unsubscribe the browser and delete the stored row. */
export async function unsubscribeFromPush(supabase: SupabaseClient): Promise<boolean> {
  const sub = await getPushSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    return false;
  }
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return true;
}
