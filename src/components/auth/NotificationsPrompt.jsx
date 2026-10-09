import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { usePushNotifications } from '../../../hooks/queries/index.js';
import { ALL_TOPIC_IDS } from '../../utils/pushNotifications.js';
import { hasDisplayName } from '../../utils/displayNameUtils.js';
import { promptStep, readSnooze, shouldOfferPushPrompt, writeSnooze } from '../../utils/pushPrompt.js';
import { InstallSteps } from './NotificationsCard.jsx';

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

/**
 * The one-time "get OG Jits on your phone?" sheet, for a signed-in, approved
 * member whose device does not have notifications on yet.
 *
 * On an iPhone in Safari it asks, then shows the two Share-menu taps only the
 * member can make; once they open the Home Screen app and sign in, it comes
 * back as "one last step" and turns every topic on in one tap. Where the
 * browser can receive push as it is, that one tap is the whole flow.
 * Settings → Profile → Notifications stays the place to change anything.
 *
 * It waits for the display-name prompt, which blocks and matters more: a
 * member without a name is not matched to a team yet.
 */
export default function NotificationsPrompt() {
  const { user, isApproved, isApprovalLoading } = useViewer();
  const push = usePushNotifications({ enabled: isApproved });
  const device = push.data;

  const [snoozedAt, setSnoozedAt] = useState(null);
  const [step, setStep] = useState(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (user?.id) setSnoozedAt(readSnooze(storage(), user.id));
  }, [user?.id]);

  const offer = !closed
    && !isApprovalLoading
    && hasDisplayName(user)
    && Boolean(device)
    && shouldOfferPushPrompt({ isApproved, state: device?.state, snoozedAt });

  if (!offer) return null;

  const face = step ?? promptStep({ state: device.state, isStandalone: device.isStandalone });

  const snooze = () => {
    writeSnooze(storage(), user.id);
    setClosed(true);
  };

  const turnOn = () => {
    push.turnOn.mutate(ALL_TOPIC_IDS, {
      onSuccess: () => {
        setClosed(true);
        toast.success('Notifications are on.', { description: 'Change them anytime in Settings.' });
      }
    });
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open) snooze(); }}>
      <SheetContent side="bottom" hideClose className="gap-0">
        <div className="mx-auto w-full max-w-md space-y-4">
          {face === 'guide' ? (
            <>
              <SheetTitle className="text-base font-semibold text-foreground">Add OG Jits to your Home Screen</SheetTitle>
              <SheetDescription className="sr-only">
                Two taps in Safari, then open OG Jits from your Home Screen.
              </SheetDescription>
              <InstallSteps finalStep="OG Jits will offer to turn on notifications. One tap and you're set." />
              <Button variant="ghost" className="w-full" onClick={snooze}>Maybe later</Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-[10px]" />
                <SheetTitle className="text-base font-semibold text-foreground">
                  {face === 'finish' ? 'One last step' : face === 'ask' ? 'Get OG Jits on your phone?' : 'Get OG Jits notifications?'}
                </SheetTitle>
              </div>
              <SheetDescription className="text-sm text-muted-foreground">
                {face === 'finish'
                  ? 'Turn on notifications for this phone.'
                  : "Pick'em reminders, take alerts, and a stat about this week's matchup every day at noon."}
              </SheetDescription>
              {push.turnOn.error && (
                <Alert variant="destructive">
                  <AlertDescription>{push.turnOn.error.message}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1">
                {face === 'ask' ? (
                  <Button className="w-full" onClick={() => setStep('guide')}>Yes, set it up</Button>
                ) : (
                  <Button className="w-full" onClick={turnOn} disabled={push.turnOn.isPending}>
                    <Bell className="mr-2 h-4 w-4" />
                    {push.turnOn.isPending ? 'Turning on…' : 'Turn on notifications'}
                  </Button>
                )}
                <Button variant="ghost" className="w-full" onClick={snooze}>Not now</Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
