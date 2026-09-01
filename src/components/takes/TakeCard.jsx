import { Coins, Check, ThumbsDown } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn, formatDate } from '../../lib/utils';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  canFade,
  fadeCount,
  fadeTerms,
  hasFaded,
  hasWager
} from './milestones.js';

/**
 * One take on the board.
 *
 * A card stack at every width — there is no table here and so no fifth column
 * to push a phone into a horizontal scroll. The card is the click target for
 * the detail sheet, which is why the Hell Nah button stops propagation: fading
 * a take and reading it are two different intentions on the same rectangle.
 *
 * Everything about the bet — the stake, the terms, the count, the button — is
 * conditional on there being a wager. An unstaked take is a prediction nobody
 * can be on the other side of, so it shows no fade affordance at all rather
 * than a disabled one or a "0 hell nahs" that means nothing.
 */
export function TakeCard({ take, displayNames = {}, onOpen, onFade, onWithdraw, pending }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const authorName = getMaskedUserName(
    displayNames[take.userId],
    take.userId,
    user,
    isAdmin,
    teamOwnerNames
  );

  const staked = hasWager(take);
  const count = fadeCount(take);
  const faded = hasFaded(take, user);
  const canToggle = canFade(take, user);

  const handleToggle = (event) => {
    event.stopPropagation();
    if (faded) onWithdraw?.(take);
    else onFade?.(take);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(take)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(take);
        }
      }}
      className={cn(
        'w-full rounded-lg border border-border bg-card p-4 text-left transition-colors',
        'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
        'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{authorName}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {formatDate(take.createdAt)}
            {/* Server-stamped, so this cannot be forged or forgotten — see
                set_take_edited_at() in the migration. */}
            {take.editedAt && <span className="normal-case tracking-normal"> · edited</span>}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[take.status] ?? 'secondary'}>
          {STATUS_LABEL[take.status] ?? take.status}
        </Badge>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {take.body}
      </p>

      {/* The stake and what pressing the button costs, together — the terms
          belong beside the number they are about, not in a legend somewhere
          else on the page. The icon carries the accent and the stake itself
          stays `text-foreground`: a wager is a fact, not a direction. */}
      {staked && (
        <div className="mt-3 rounded-md bg-muted/60 px-2.5 py-2">
          <p className="flex items-baseline gap-1.5 text-[13px]">
            <Coins
              className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-warning"
              aria-hidden="true"
            />
            <span className="text-muted-foreground">The bet</span>
            <span className="break-words text-foreground">{take.wager}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{fadeTerms(take)}</p>
        </div>
      )}

      {/* No wager, no sides: the whole row goes rather than rendering a count
          of nothing. The count *is* always shown on a staked take, though —
          the author cannot fade their own, but they need to see the six people
          who did, because that is who they owe. */}
      {staked && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            {count} {count === 1 ? 'hell nah' : 'hell nahs'}
          </span>

          {canToggle && (
            <Button
              variant={faded ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleToggle}
              disabled={pending}
              className="gap-1.5"
            >
              {faded ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Hell Nah&apos;d
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
    </div>
  );
}

export default TakeCard;
