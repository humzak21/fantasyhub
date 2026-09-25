import { useEffect, useState } from 'react';
import { ThumbsUp } from 'lucide-react';

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
import { buttonVariants } from '../ui/button';
import { Input } from '../ui/input';
import { formatDateTime } from '../../lib/utils';
import { HELL_YEAH_STAKE_TERMS, MAX_WAGER, fadeDeadline } from './milestones.js';

/**
 * The question a Hell Yeah asks: do you want to put a stake on it too?
 *
 * At its core a Hell Yeah is just "good call", and the dialog is built so that
 * reading stays true. The stake is labelled optional, the line under the box
 * says blank means skip, and skipping is a button of its own — **"Just Hell
 * Yeah"**, beside the one that adds the stake — rather than something a reader
 * has to infer from a box they were allowed to leave empty. The stake button
 * stays disabled until there is a stake, so the only way to add one is to
 * type one.
 *
 * It opens on every Hell Yeah, staked take or not, because a backer's stake
 * is a show of confidence rather than a bet: nobody owes anybody over it, so
 * it needs no Hell Nahs on the other side. The copy says so in as many words,
 * since the author's stake quoted above the box *is* a bet and the two are
 * easy to read as one.
 *
 * No "don't show this again", unlike `HellNahDialog`: that one explains a
 * price, which a regular has already read; this one asks something whose
 * answer changes from take to take.
 */
export function HellYeahDialog({ take, open, onOpenChange, onConfirm, pending }) {
  const [stake, setStake] = useState('');

  // The box belongs to one opening of the dialog. Cancelling with a stake
  // typed must not carry it onto the next take.
  const takeId = take?.id;
  useEffect(() => {
    if (!open) setStake('');
  }, [open, takeId]);

  if (!take) return null;

  const trimmed = stake.trim();
  const deadline = fadeDeadline(take);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-success" aria-hidden="true" />
            Hell Yeah this take?
          </AlertDialogTitle>
          <AlertDialogDescription>
            A Hell Yeah backs the take &mdash; that&apos;s all it has to be. You can also add a
            stake of your own to show how sure you are, but you don&apos;t have to.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <blockquote className="rounded-md border-l-2 border-border bg-muted/40 py-2 pl-3 pr-2 text-sm leading-relaxed text-foreground">
          {take.body}
          {take.wager && (
            <span className="mt-1 block text-xs text-muted-foreground">
              The author has {take.wager} on it.
            </span>
          )}
        </blockquote>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed && !pending) onConfirm?.(take, trimmed);
          }}
        >
          <label htmlFor="hell-yeah-stake" className="mb-1 block text-sm font-medium">
            Your stake <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="hell-yeah-stake"
            value={stake}
            onChange={(event) => setStake(event.target.value)}
            maxLength={MAX_WAGER}
            placeholder="e.g. $10, or 20 FAAB"
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {HELL_YEAH_STAKE_TERMS} Leave it blank to skip &mdash; your Hell Yeah counts either
            way.
          </p>
        </form>

        {deadline && (
          <p className="text-sm text-muted-foreground">
            Stakes close{' '}
            <span className="text-foreground">{formatDateTime(deadline)}</span> &mdash; three days
            after the take was last edited. A Hell Yeah with a stake can be taken back until then
            and is locked in after; one without a stake can be taken back any time before the
            take is graded.
          </p>
        )}

        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'outline' })}
            disabled={pending}
            onClick={() => onConfirm?.(take, null)}
          >
            Just Hell Yeah
          </AlertDialogAction>
          <AlertDialogAction disabled={pending || !trimmed} onClick={() => onConfirm?.(take, trimmed)}>
            Hell Yeah with stake
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default HellYeahDialog;
