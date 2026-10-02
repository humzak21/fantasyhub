/**
 * Push notifications on this device: whether they can be turned on, whether
 * they are, and which topics it gets. The browser holds half the answer (the
 * service worker's subscription and the permission) and `push_subscriptions`
 * the other half (the stored row and its topics), so one query reads both and
 * the card renders `resolvePushState` over the result.
 *
 * A browser subscription with no stored row reads as *off* — the server
 * cleaned it up after the push service reported it gone, or the device last
 * belonged to another account. Turning on again re-saves the same
 * subscription rather than asking the browser for a new one.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import {
  getBrowserSubscription,
  readPushEnvironment,
  resolvePushState,
  subscribeBrowser,
  unsubscribeBrowser
} from '../../src/utils/pushNotifications.js';
import { qk } from './keys.js';

const db = () => getDb();

async function readDeviceState() {
  const env = readPushEnvironment();
  const subscription = env.hasPush ? await getBrowserSubscription() : null;
  const stored = subscription ? await db().notifications.getMyPushSubscription(subscription.endpoint) : null;
  const subscribed = Boolean(subscription && stored);
  return {
    ...env,
    endpoint: subscription?.endpoint ?? null,
    topics: stored?.topics ?? [],
    subscribed,
    state: resolvePushState({ ...env, subscribed })
  };
}

export function usePushNotifications({ enabled = true } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = qk.viewer.push(user?.id ?? null);

  const query = useQuery({
    queryKey: key,
    queryFn: readDeviceState,
    enabled: Boolean(user?.id) && enabled,
    // Permission can change in iOS Settings while the app is backgrounded.
    refetchOnWindowFocus: true,
    staleTime: 30_000
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const turnOn = useMutation({
    mutationFn: async (topics) => {
      const subscription = await subscribeBrowser();
      const userAgent = typeof navigator === 'undefined' ? null : navigator.userAgent;
      return db().notifications.saveMyPushSubscription(subscription, topics, userAgent);
    },
    onSettled: refresh
  });

  const setTopics = useMutation({
    mutationFn: async (topics) => {
      const subscription = await getBrowserSubscription();
      if (!subscription) throw new Error('Notifications are not on for this device.');
      const userAgent = typeof navigator === 'undefined' ? null : navigator.userAgent;
      return db().notifications.saveMyPushSubscription(subscription, topics, userAgent);
    },
    onSettled: refresh
  });

  const turnOff = useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribeBrowser();
      await db().notifications.deleteMyPushSubscription(endpoint);
    },
    onSettled: refresh
  });

  return { ...query, turnOn, setTopics, turnOff };
}
