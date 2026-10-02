import { Bell, BellOff, Share, SquarePlus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription } from '../ui/alert';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { usePushNotifications } from '../../../hooks/queries/index.js';
import { ALL_TOPIC_IDS, PUSH_TOPICS, showLocalTestNotification } from '../../utils/pushNotifications.js';

/**
 * Settings → Profile → Notifications.
 *
 * Push on an iPhone needs the Home Screen app, so most of what this card does
 * is say which step the member is on: add to Home Screen, allow, done. The
 * states come from `resolvePushState`; the topics are per device.
 */
export default function NotificationsCard() {
  const { isApproved, isApprovalLoading } = useViewer();
  const push = usePushNotifications({ enabled: isApproved });
  const busy = push.turnOn.isPending || push.turnOff.isPending || push.setTopics.isPending;
  const error = push.turnOn.error || push.turnOff.error || push.setTopics.error;
  const device = push.data;

  let body;
  if (isApprovalLoading) {
    body = <Loading />;
  } else if (!isApproved) {
    body = (
      <p className="text-sm text-muted-foreground">
        Notifications are about pick&apos;ems, so they open up once the admin has approved your account.
      </p>
    );
  } else if (push.isPending || !device) {
    body = <Loading />;
  } else if (device.state === 'install') {
    body = <InstallSteps />;
  } else if (device.state === 'unsupported') {
    body = (
      <p className="text-sm text-muted-foreground">
        This browser can&apos;t receive notifications. On an iPhone, open the site in Safari and add it to
        your Home Screen first.
      </p>
    );
  } else if (device.state === 'denied') {
    body = (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for this app. To allow them, open iOS <strong>Settings → Notifications →
        OG Jits</strong> and turn on Allow Notifications, then come back here.
      </p>
    );
  } else if (device.state === 'off') {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Get a nudge when pick&apos;ems open on Tuesday and, if you haven&apos;t picked, a few hours before
          they close on Thursday.
        </p>
        <Button onClick={() => push.turnOn.mutate(ALL_TOPIC_IDS)} disabled={busy}>
          <Bell className="mr-2 h-4 w-4" />
          {push.turnOn.isPending ? 'Turning on…' : 'Turn on notifications'}
        </Button>
      </div>
    );
  } else {
    const topics = new Set(device.topics);
    const toggle = (id, on) => {
      const next = ALL_TOPIC_IDS.filter((topic) => (topic === id ? on : topics.has(topic)));
      push.setTopics.mutate(next);
    };
    body = (
      <div className="space-y-4">
        <ul className="space-y-3">
          {PUSH_TOPICS.map((topic) => (
            <li key={topic.id} className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor={`push-${topic.id}`} className="text-sm font-medium text-foreground">
                  {topic.label}
                </label>
                <p className="text-xs text-muted-foreground">{topic.description}</p>
              </div>
              <Switch
                id={`push-${topic.id}`}
                checked={topics.has(topic.id)}
                onCheckedChange={(on) => toggle(topic.id, on)}
                disabled={busy}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => showLocalTestNotification()} disabled={busy}>
            Show a test notification
          </Button>
          <Button variant="ghost" size="sm" onClick={() => push.turnOff.mutate()} disabled={busy}>
            <BellOff className="mr-2 h-4 w-4" />
            {push.turnOff.isPending ? 'Turning off…' : 'Turn off on this device'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>
          Pick&apos;em reminders on your phone. Set per device: turning them on here does not turn them on
          anywhere else.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {body}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function Loading() {
  return <div className="h-10 max-w-sm animate-pulse rounded-md bg-muted" aria-busy="true" aria-label="Loading" />;
}

function InstallSteps() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        iPhones only deliver notifications to the OG Jits app on your Home Screen, not to a Safari tab.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-foreground">
        <li>
          In Safari, tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> Share, then{' '}
          <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" /> <strong>Add to Home Screen</strong>.
        </li>
        <li>Open OG Jits from your Home Screen and sign in with your password.</li>
        <li>Come back to Settings and tap <strong>Turn on notifications</strong>.</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Already have an OG Jits icon from before October 2026? Delete it and add it again — the old one
        opens Safari, not the app. Email login links always open in Safari, so sign in to the app with
        your password.
      </p>
    </div>
  );
}
