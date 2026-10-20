import { useEffect, useRef, useState } from 'react';
import { Swords } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { describeTauntResult, tauntState } from '../../utils/taunts.js';

/**
 * Send today's matchup fact to the opponent it is about.
 *
 * Opens from a matchup fact: tapping it on the lock screen or in Alerts lands
 * on `/alerts?taunt=<id>`. iOS shows no buttons on web notifications, so this
 * sheet is the Taunt button there. Where a device does show the
 * notification's Taunt button, it lands on `…&send=1` (`autoSend`), and the
 * press has already been made: the sheet sends at once and reports.
 *
 * It shows both halves before anything is sent — the fact as the member got
 * it, and the same fact written to the opponent — because the second is what
 * the opponent will read, under the member's name.
 */
const TauntSheet = ({ taunt, isLoading, autoSend = false, onSend, isSending, onClose }) => {
  const [result, setResult] = useState(null);
  const sentOnce = useRef(false);
  const state = tauntState(taunt);
  const opponent = taunt?.opponentName ?? 'your opponent';

  const send = async () => {
    if (!taunt || sentOnce.current) return;
    sentOnce.current = true;
    try {
      setResult(await onSend(taunt.id));
    } catch (error) {
      sentOnce.current = false;
      setResult({ error: error.message });
    }
  };

  useEffect(() => {
    if (autoSend && state === 'open') send();
    // Only once the offer has loaded; `send` guards against a second press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, state]);

  const message = result
    ? result.error ?? describeTauntResult(result, opponent)
    : state === 'sent'
      ? `You already taunted ${opponent} with this one.`
      : state === 'expired'
        ? describeTauntResult('expired')
        : null;
  const done = Boolean(result) || state !== 'open';

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="gap-0">
        <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-6 pt-2">
          <div className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Swords className="h-4 w-4 text-primary" aria-hidden="true" />
              {isLoading ? 'Taunt' : taunt ? `Taunt ${opponent}` : 'Taunt not found'}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {taunt
                ? `Send ${opponent} today's fact. They get it as a notification and in their Alerts.`
                : isLoading
                  ? 'Loading…'
                  : 'This taunt is not one of yours, or it no longer exists.'}
            </SheetDescription>
          </div>

          {taunt && (
            <>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Your fact</p>
                <p className="text-sm text-foreground">{taunt.fact}</p>
              </div>
              <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">{opponent} gets</p>
                <p className="text-sm font-semibold text-foreground">{taunt.taunt}</p>
              </div>
            </>
          )}

          {message && (
            <p role="status" className="text-sm text-foreground">
              {message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              {done ? 'Close' : 'Not now'}
            </Button>
            {taunt && !done && (
              <Button onClick={send} disabled={isSending}>
                <Swords className="mr-2 h-4 w-4" aria-hidden="true" />
                {isSending ? 'Sending…' : `Taunt ${opponent}`}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TauntSheet;
