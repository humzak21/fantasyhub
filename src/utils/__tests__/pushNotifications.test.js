import { describe, it, expect } from 'vitest';

import { readPushEnvironment, resolvePushState, urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from '../pushNotifications.js';

const iphoneTab = { hasPush: false, isIos: true, isStandalone: false, permission: 'default' };
const iphoneApp = { hasPush: true, isIos: true, isStandalone: true, permission: 'default' };

describe('resolvePushState', () => {
  it('sends an iPhone Safari tab to the Home Screen first', () => {
    expect(resolvePushState({ ...iphoneTab, subscribed: false })).toBe('install');
    // Even if a future Safari grows PushManager in a tab, the app is what gets delivered to.
    expect(resolvePushState({ ...iphoneTab, hasPush: true, subscribed: false })).toBe('install');
  });

  it('walks the installed app through off → on', () => {
    expect(resolvePushState({ ...iphoneApp, subscribed: false })).toBe('off');
    expect(resolvePushState({ ...iphoneApp, permission: 'granted', subscribed: true })).toBe('on');
  });

  it('a refusal can only be undone in iOS Settings', () => {
    expect(resolvePushState({ ...iphoneApp, permission: 'denied', subscribed: false })).toBe('denied');
  });

  it('a stored subscription without permission is not "on"', () => {
    expect(resolvePushState({ ...iphoneApp, permission: 'default', subscribed: true })).toBe('off');
  });

  it('a desktop browser with push skips the install step', () => {
    expect(resolvePushState({ hasPush: true, isIos: false, isStandalone: false, permission: 'default', subscribed: false }))
      .toBe('off');
    expect(resolvePushState({ hasPush: false, isIos: false, isStandalone: false, permission: 'default', subscribed: false }))
      .toBe('unsupported');
  });
});

describe('readPushEnvironment', () => {
  const win = ({ ua, standalone = false, platform = 'iPhone', touch = 5, push = true }) => ({
    navigator: { userAgent: ua, standalone, platform, maxTouchPoints: touch, ...(push ? { serviceWorker: {} } : {}) },
    matchMedia: () => ({ matches: false }),
    ...(push ? { PushManager: function PushManager() {}, Notification: { permission: 'default' } } : {})
  });

  it('recognises an iPhone and the Home Screen app', () => {
    const env = readPushEnvironment(win({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true }));
    expect(env).toMatchObject({ isIos: true, isStandalone: true, hasPush: true });
  });

  it('recognises an iPad that calls itself a Mac', () => {
    const env = readPushEnvironment(win({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touch: 5, push: false }));
    expect(env).toMatchObject({ isIos: true, hasPush: false });
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes the VAPID key to a 65-byte uncompressed P-256 point', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe('PUSH_TOPICS', () => {
  it('offers exactly the topics the sender knows, in the database\'s list', async () => {
    const { ALL_TOPIC_IDS } = await import('../pushNotifications.js');
    const { ALL_TOPICS } = await import('../../../services/notificationPlanner.js');
    // push_subscriptions_topics_check (20261007120000_take_notifications.sql) is the third copy.
    expect(ALL_TOPIC_IDS).toEqual([...ALL_TOPICS]);
  });
});
