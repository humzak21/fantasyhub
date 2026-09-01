import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { listWeeks } from '../../../utils/seasonConfig.js';
import { getWeekLabel } from '../../../utils/weekLabelUtils.js';
import {
  TARGET_END_OF_REGULAR_SEASON,
  TARGET_END_OF_SEASON,
  TARGET_WEEK
} from './milestones.js';

const MAX_BODY = 500;

/** Mirrors `takes_wager_check`. The stake is a phrase — "$20", "40 FAAB" — not
 *  an essay, and a length the database will refuse should not be typeable. */
const MAX_WAGER = 200;

/** The two terminal milestones, as `Select` values. Weeks are `week:N`, so one
 *  string carries both the type and the week and the Select stays flat. */
const END_OF_REGULAR_SEASON = TARGET_END_OF_REGULAR_SEASON;
const END_OF_SEASON = TARGET_END_OF_SEASON;

const weekValue = (week) => `${TARGET_WEEK}:${week}`;

function parseMilestone(value) {
  if (value === END_OF_REGULAR_SEASON || value === END_OF_SEASON) {
    return { targetType: value, targetWeek: null };
  }
  const [, week] = value.split(':');
  return { targetType: TARGET_WEEK, targetWeek: Number(week) };
}

/**
 * Post a take, or reword one.
 *
 * Edit mode leaves the milestone control mounted but disabled. That is not a
 * courtesy: `takes_guard_author_update` rejects an UPDATE that moves the
 * milestone, so an enabled control here would offer a change the database is
 * going to refuse. Showing it disabled says what the take is about while making
 * clear it is settled.
 */
export function AddTakeDialog({
  open,
  onOpenChange,
  seasonConfig,
  defaultWeek,
  take = null,
  onSubmit,
  submitting
}) {
  const isEdit = Boolean(take);

  const [body, setBody] = useState('');
  const [wager, setWager] = useState('');
  const [milestone, setMilestone] = useState(END_OF_SEASON);
  const [error, setError] = useState(null);

  // Seed on open, not on mount: the dialog stays mounted between openings, so
  // without this the second take starts with the first one's text.
  useEffect(() => {
    if (!open) return;

    setError(null);
    setBody(take?.body ?? '');
    // '' rather than null: this is a controlled input, and seeding it from the
    // row is also what lets an author clear a stake — `updateTake` writes the
    // column on every edit, so an empty box means "no bet" rather than
    // "unchanged".
    setWager(take?.wager ?? '');

    if (take) {
      setMilestone(
        take.targetType === TARGET_WEEK ? weekValue(take.targetWeek) : take.targetType
      );
    } else {
      setMilestone(defaultWeek ? weekValue(defaultWeek) : END_OF_SEASON);
    }
  }, [open, take, defaultWeek]);

  const weeks = listWeeks(seasonConfig);
  const remaining = MAX_BODY - body.length;

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmed = body.trim();
    if (!trimmed) {
      setError('A take needs something to say.');
      return;
    }
    if (trimmed.length > MAX_BODY) {
      setError(`Takes are capped at ${MAX_BODY} characters.`);
      return;
    }

    const trimmedWager = wager.trim();
    if (trimmedWager.length > MAX_WAGER) {
      setError(`Keep the stake under ${MAX_WAGER} characters.`);
      return;
    }

    setError(null);

    try {
      await onSubmit({
        body: trimmed,
        wager: trimmedWager || null,
        ...parseMilestone(milestone)
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError?.message ?? 'Could not save that take.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit take' : 'Post a take'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'You can reword a take for 72 hours after posting. The milestone is fixed.'
              : 'Call it now. The admin grades it once the milestone passes.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="take-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="take-body" className="mb-1 block text-sm font-medium">
                Your take
              </label>
              <Textarea
                id="take-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={MAX_BODY}
                rows={5}
                placeholder="e.g. Nobody in this league finishes above .500 against the East"
                required
              />
              <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                {remaining} left
              </p>
            </div>

            <div>
              <label htmlFor="take-wager" className="mb-1 block text-sm font-medium">
                What You&apos;ll Bet{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="take-wager"
                value={wager}
                onChange={(event) => setWager(event.target.value)}
                maxLength={MAX_WAGER}
                placeholder="e.g. $20, or 40 FAAB"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                What you&apos;re risking against anyone who says Hell Nah. Free text — say the
                currency. If the take misses, you pay out everyone who faded it. Leave this
                blank and nobody can bet against the take at all.
              </p>
            </div>

            <div>
              <label htmlFor="take-milestone" className="mb-1 block text-sm font-medium">
                Resolves
              </label>
              <Select value={milestone} onValueChange={setMilestone} disabled={isEdit}>
                <SelectTrigger id="take-milestone">
                  <SelectValue placeholder="When does this settle?" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((week) => (
                    <SelectItem key={week} value={weekValue(week)}>
                      {getWeekLabel(
                        week,
                        seasonConfig?.regularSeasonWeeks,
                        seasonConfig?.weekCount
                      )}
                    </SelectItem>
                  ))}
                  <SelectItem value={END_OF_REGULAR_SEASON}>End of regular season</SelectItem>
                  <SelectItem value={END_OF_SEASON}>End of season</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEdit
                  ? 'A take cannot be moved to a different milestone once posted.'
                  : 'The board is sorted by this, so takes come due in order.'}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="take-form" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Post take'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddTakeDialog;
