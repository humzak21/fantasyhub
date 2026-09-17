import { useEffect, useState } from 'react';
import { ThumbsDown } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';
import { formatDateTime } from '../../lib/utils';
import { fadeDeadline, fadeTerms } from './milestones.js';

/**
 * The confirmation in front of a Hell Nah.
 *
 * Pressing it is the only control in this app that commits the viewer to
 * paying somebody money, and since the three-day window it is also the only
 * one with a deadline attached to changing your mind. The terms have always
 * been printed beside the button — but a sentence on a card is read once, when
 * the card is new, and the button is pressed weeks later. So the price and the
 * deadline are restated at the moment of the click, over the take's own
 * wording, where they cannot be scrolled past.
 *
 * It is a dialog rather than a toast-with-undo because the thing being
 * confirmed is not "did you mean to tap that" — it is "do you understand what
 * this costs", and an undo window of a few seconds answers the wrong question
 * when the real one runs for three days.
 *
 * **The checkbox is a per-person, per-browser preference, not a rule** — see
 * `confirmPreference.js`. It suppresses this dialog and nothing else: the
 * database's window and the wager are unchanged, and the terms stay printed on
 * the card and in the sheet. Somebody who has faded a dozen takes does not
 * need the explanation a thirteenth time, and a dialog that cannot be
 * dismissed permanently is one that gets clicked through without reading,
 * which is worse than not showing it.
 */

export function HellNahDialog({ take, open, onOpenChange, onConfirm, pending }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // The box belongs to one opening of the dialog. Cancelling with it ticked
  // must not carry the preference into the next take.
  const takeId = take?.id;
  useEffect(() => {
    if (!open) setDontShowAgain(false);
  }, [open, takeId]);

  if (!take) return null;

  const deadline = fadeDeadline(take);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ThumbsDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Say Hell Nah to this take?
          </AlertDialogTitle>
          <AlertDialogDescription>{fadeTerms(take)}</AlertDialogDescription>
        </AlertDialogHeader>

        {/* The take itself, quoted. The board is two-up and the sheet is a
            scroll, so by the time this opens the sentence being bet on may
            well be off-screen — and "you owe $20" means nothing without it. */}
        <blockquote className="rounded-md border-l-2 border-border bg-muted/40 py-2 pl-3 pr-2 text-sm leading-relaxed text-foreground">
          {take.body}
        </blockquote>

        <p className="text-sm text-muted-foreground">
          {deadline ? (
            <>
              You can take it back until{' '}
              <span className="text-foreground">{formatDateTime(deadline)}</span> — three days
              after the take was last edited. After that it is locked in, whichever way it goes.
            </>
          ) : (
            'Once the window closes, three days after the take was last edited, it is locked in whichever way it goes.'
          )}
        </p>

        {/* A label wrapping the control, so the whole line is the hit target —
            a 16px box on a phone is not one. */}
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-muted-foreground">
          <Checkbox
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          Don&apos;t show this again
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => onConfirm?.(take, dontShowAgain)}>
            Hell Nah
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default HellNahDialog;
