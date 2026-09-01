import { Check, Coins, Minus, Pencil, RotateCcw, ThumbsDown, Trash2, X } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '../ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../ui/alert-dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { formatDate, formatDateTime } from '../../lib/utils';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { TakeActivityLog } from './TakeActivityLog.jsx';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  canDeleteTake,
  canEditTake,
  canFade,
  fadeTerms,
  hasFaded,
  hasWager,
  isPending,
  milestoneLabel
} from './milestones.js';

const FieldRow = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
    <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
    <span className="text-right text-sm text-foreground">{children}</span>
  </div>
);

/**
 * One take, in full: who called it, who joined, and what the admin did about it.
 *
 * It reads its take from the board query's cache rather than fetching — the
 * board already carries the fades, so opening a take costs nothing. The
 * caller passes the take down; when the board refetches after a mutation the
 * caller hands over the fresh row, which is why nothing here holds a copy.
 *
 * The activity log is the one thing that does cost a request, and it arrives
 * the same way: fetched by the caller, passed in here. This component stays
 * presentational, so a test can render any history it likes without a query
 * client standing behind it.
 */
export function TakeDetailSheet({
  take,
  displayNames = {},
  seasonConfig,
  activity,
  activityLoading,
  open,
  onOpenChange,
  onFade,
  onWithdraw,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  pending
}) {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  if (!take) return null;

  const nameOf = (userId) =>
    getMaskedUserName(displayNames[userId], userId, user, isAdmin, teamOwnerNames);

  const participants = take.takeParticipants || [];
  const staked = hasWager(take);
  const faded = hasFaded(take, user);
  const canToggle = canFade(take, user);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Wider than the primitive's `max-w-sm` default, matching the standings
          drawer: this holds a paragraph plus a roster of faders. */}
      <SheetContent side="right" className="w-[92vw] max-w-[690px] overflow-y-auto sm:w-[690px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl tracking-tight">Take</SheetTitle>
          <SheetDescription>
            {nameOf(take.userId)} · {milestoneLabel(take, seasonConfig)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {take.body}
            </p>
          </div>

          {/* Its own block rather than a FieldRow: those right-align a short
              value on one line, and a stake runs to 200 characters. The terms
              sit with it, because this is the sentence somebody should have
              read before the button below it. */}
          {staked && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <Coins className="mr-1 inline h-3.5 w-3.5 text-warning" aria-hidden="true" />
                The bet
              </h3>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
                {take.wager}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {fadeTerms(take)}
              </p>
            </div>
          )}

          <div>
            <FieldRow label="Status">
              <Badge variant={STATUS_BADGE[take.status] ?? 'secondary'}>
                {STATUS_LABEL[take.status] ?? take.status}
              </Badge>
            </FieldRow>
            <FieldRow label="Resolves">{milestoneLabel(take, seasonConfig)}</FieldRow>
            <FieldRow label="Posted">{formatDateTime(take.createdAt)}</FieldRow>
            {take.editedAt && <FieldRow label="Edited">{formatDateTime(take.editedAt)}</FieldRow>}
            {take.resolvedAt && <FieldRow label="Graded">{formatDateTime(take.resolvedAt)}</FieldRow>}
          </div>

          {/* Nothing staked, nothing to fade — so this whole section is absent
              rather than an empty roster on a take that could never have one. */}
          {staked && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <ThumbsDown className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Hell nah&apos;d by {participants.length}
            </h3>

            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody has taken the other side of this yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {participants.map((participant) => (
                  <li
                    key={participant.id ?? participant.userId}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="truncate text-foreground">{nameOf(participant.userId)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDate(participant.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canToggle && (
              <Button
                variant={faded ? 'secondary' : 'outline'}
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => (faded ? onWithdraw?.(take) : onFade?.(take))}
                disabled={pending}
              >
                {faded ? (
                  <>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Take it back
                  </>
                ) : (
                  <>
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                    Hell Nah
                  </>
                )}
              </Button>
            )}
          </div>
          )}

          {(canEditTake(take, user) || canDeleteTake(take, user)) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {canEditTake(take, user) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit?.(take)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
              )}

              {canDeleteTake(take, user) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this take?</AlertDialogTitle>
                      <AlertDialogDescription>
                        It disappears from the board along with every Hell Nah on it. This cannot
                        be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete?.(take)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete take
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Grade this take
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {isPending(take) ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={pending}
                      onClick={() => onResolve?.(take, 'correct')}
                    >
                      <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                      Correct
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={pending}
                      onClick={() => onResolve?.(take, 'incorrect')}
                    >
                      <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                      Incorrect
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={pending}
                      onClick={() => onResolve?.(take, 'push')}
                    >
                      <Minus className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                      Push
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={pending}
                    onClick={() => onReopen?.(take)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reopen
                  </Button>
                )}
              </div>
              {take.resolvedBy && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Graded by {nameOf(take.resolvedBy)}.
                </p>
              )}
            </div>
          )}

          {/* Last, and for everyone: the log is the record the league argues
              from, not an admin tool. It sits below the controls because it
              answers "what happened to this" rather than "what can I do with
              this", and the second question is the one somebody opened the
              sheet holding. */}
          <TakeActivityLog
            events={activity?.events}
            displayNames={activity?.displayNames}
            seasonConfig={seasonConfig}
            loading={activityLoading}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default TakeDetailSheet;
