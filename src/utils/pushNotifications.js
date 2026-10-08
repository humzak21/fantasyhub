/**
 * Push notifications, the browser half. The server half is
 * `scripts/send-notifications.js`; the table is `push_subscriptions`.
 *
 * On an iPhone, Web Push works only in the Home Screen app (iOS 16.4+): a
 * Safari tab has no `PushManager` at all. So the first question is not "may we
 * notify" but "is this the installed app", and `resolvePushState` turns the
 * browser's answers into the one thing the Settings card should say.
 */

/**
 * The public half of the VAPID key pair. Public by design — it goes to every
 * browser that subscribes — so it lives in the bundle. The private half is the
 * `VAPID_PRIVATE_KEY` GitHub Actions secret, and the two must be a pair:
 * rotating keys means changing this and that secret together, after which
 * every member has to turn notifications on again.
 */
export const VAPID_PUBLIC_KEY =
  import.meta.env?.VITE_VAPID_PUBLIC_KEY ||
  'BC-c550v6RbFwRIJbRdHSf6wQU-B_SW3RZGY5UTUB0hoqUwGg2gnhxBFGvhUV_XoY0KdH8bZnbfyc4g0gloLmGM';

export const SERVICE_WORKER_URL = '/sw.js';

/**
 * Every topic a device can ask for, with its label, grouped the way the
 * Settings card shows them. Order is display order. The ids are
 * `push_subscriptions_topics_check`'s list and `TOPICS` in
 * services/notificationPlanner.js; a new topic is all three.
 */
export const PUSH_TOPIC_GROUPS = [
  {
    id: 'pickems',
    label: "Pick'ems",
    topics: [
      {
        id: 'pickems_open',
        label: "Pick'ems are open",
        description: "Tuesday morning, when the week's picks and TD parlay open."
      },
      {
        id: 'pickems_closing',
        label: "Pick'ems close soon",
        description: "Thursday afternoon, only if you haven't picked yet."
      }
    ]
  },
  {
    id: 'takes',
    label: 'Takes',
    topics: [
      {
        id: 'takes_new',
        label: 'New takes',
        description: 'Whenever somebody else posts a take.'
      },
      {
        id: 'takes_reactions',
        label: 'Hell Yeahs and Hell Nahs on your takes',
        description: 'When somebody backs or fades a take you posted.'
      }
    ]
  }
];

export const PUSH_TOPICS = PUSH_TOPIC_GROUPS.flatMap((group) => group.topics);

export const ALL_TOPIC_IDS = PUSH_TOPICS.map((topic) => topic.id);

/**
 * What the Settings card shows.
 *
 *   unsupported — this browser cannot do Web Push at all (and is not an
 *                 iPhone Safari tab that could after installing)
 *   install     — an iPhone/iPad outside the Home Screen app: add it first
 *   denied      — the member said no; only iOS Settings can undo that
 *   off         — can subscribe, has not (or turned it off)
 *   on          — subscribed on this device
 */
export function resolvePushState({ hasPush, isIos, isStandalone, permission, subscribed }) {
  if (isIos && !isStandalone) return 'install';
  if (!hasPush) return 'unsupported';
  if (permission === 'denied') return 'denied';
  if (subscribed && permission === 'granted') return 'on';
  return 'off';
}

/** Read the environment for `resolvePushState`. */
export function readPushEnvironment(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return { hasPush: false, isIos: false, isStandalone: false, permission: 'default' };
  const nav = win.navigator ?? {};
  const ua = nav.userAgent ?? '';
  // iPadOS reports itself as a Mac; the touch points give it away.
  const isIos = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isStandalone =
    Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches) || nav.standalone === true;
  const hasPush = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  return {
    hasPush,
    isIos,
    isStandalone,
    permission: 'Notification' in win ? win.Notification.permission : 'default'
  };
}

/** The base64url VAPID key as the bytes `pushManager.subscribe` wants. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Register the service worker once, at startup. Harmless where push is not
 * supported, and the worker caches nothing (see public/sw.js).
 */
export function registerServiceWorker(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  if (!nav?.serviceWorker) return Promise.resolve(null);
  return nav.serviceWorker.register(SERVICE_WORKER_URL).catch(() => null);
}

async function readyRegistration() {
  await registerServiceWorker();
  return navigator.serviceWorker.ready;
}

/** This device's current browser subscription, or null. */
export async function getBrowserSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Ask for permission (it must follow a tap — iOS refuses otherwise) and
 * subscribe. Returns the subscription, or throws with a message worth showing.
 */
export async function subscribeBrowser() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this app. Turn them on in iOS Settings → Notifications → OG Jits.'
        : 'Notifications were not allowed.'
    );
    error.permission = permission;
    throw error;
  }

  const registration = await readyRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
}

/** Unsubscribe this device in the browser. Returns the endpoint it had. */
export async function unsubscribeBrowser() {
  const subscription = await getBrowserSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/**
 * Show a notification from this device itself — proof that the app may
 * display one, without a round trip through the push service. The real
 * end-to-end test is the workflow's `test_email` input.
 */
export async function showLocalTestNotification() {
  const registration = await readyRegistration();
  await registration.showNotification('Notifications are on', {
    body: "You'll hear from OG Jits about pick'ems and takes, whichever you've left on.",
    icon: '/icon-192.png',
    tag: 'local-test',
    data: { url: '/settings' }
  });
}
