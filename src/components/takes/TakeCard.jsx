import { Coins, Check, Handshake, ThumbsDown, ThumbsUp } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn, formatDate } from '../../lib/utils';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  canFade,
  canHellYeah,
  canWithdrawFade,
  canWithdrawHellYeah,
  fadeCount,
  fadeDeadline,
  fadeWindowNote,
  hasFaded,
  hasHellYeahed,
  hasWager,
  hellYeahCount,
  isPending,
  stakeRequestsFor
} from './milestones.js';

/**
 * One take on the board.
 *
 * A card stack at every width — there is no table here and so no fifth column
 * to push a phone into a horizontal scroll. The card is the click target for
 * the detail sheet, which is why the Hell Yeah and Hell Nah buttons stop
 * propagation: taking a side and reading it are two different intentions on
 * the same rectangle.
 *
 * Everything about the bet — the stake, the terms, the Hell Nah count and
 * button — is conditional on there being a wager. An unstaked take is a
 * prediction nobody can be on the other side of, so it shows no fade
 * affordance at all rather than a disabled one or a "0 hell nahs" that means
 * nothing. Hell Yeah is not: backing a call needs nothing staked.
 *
 * `compact` is the home page's density: tighter padding and the body clamped
 * to four lines. The action row is unchanged — one component, two densities,
 * never a `HomeTakeCard` twin whose buttons could drift from these.
 */
export function TakeCard({
  take,
  displayNames = {},
  onOpen,
  onFade,
  onWithdraw,
  onHellYeah,
  onWithdrawHellYeah,
  pending,
  compact = false
}) {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const nameOf = (userId) =>
    getMaskedUserName(displayNames[userId], userId, user, isAdmin, teamOwnerNames);
  const authorName = nameOf(take.userId);

  const staked = hasWager(take);
  const count = fadeCount(take);
  const faded = hasFaded(take, user);
  const yeahCount = hellYeahCount(take);
  const yeahed = hasHellYeahed(take, user);
  // Staked Hell Yeahs this viewer has been asked to accept. The answer is
  // given in the sheet, which the whole card already opens; the line is what
  // tells a Hell Nah scrolling the board that a question is waiting.
  const stakeRequests = stakeRequestsFor(take, user);

  // The two sides of the Hell Nah are separate questions now: joining needs a
  // wager and an open window, leaving needs only the window. A viewer who
  // faded a take whose window has since closed keeps the state and loses the
  // button — which is the rule, not a rendering accident, so it is said rather
  // than left to a disabled control.
  const canToggle = faded ? canWithdrawFade(take, user) : canFade(take, user);
  const windowNote = user?.id && isPending(take) ? fadeWindowNote(take) : null;
  const compactDeadline = (() => {
    if (!compact || !user?.id || !isPending(take)) return null;
    const deadline = fadeDeadline(take);
    if (deadline === null) return null;
    return deadline > Date.now() ? `closes ${formatDate(deadline)}` : 'closed';
  })();

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
        'w-full rounded-lg border border-border bg-card text-left transition-colors',
        compact ? 'p-3' : 'p-4',
        'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
        'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{authorName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(take.createdAt)}
            {/* Server-stamped, so this cannot be forged or forgotten — see
                set_take_edited_at() in the migration. */}
            {take.editedAt && <span> · edited</span>}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[take.status] ?? 'secondary'}>
          {STATUS_LABEL[take.status] ?? take.status}
        </Badge>
      </div>

      <p
        className={cn(
          'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
          compact ? 'mt-2 line-clamp-3 text-pretty' : 'mt-3'
        )}
      >
        {take.body}
      </p>

      {/* The stake, as one line. What pressing Hell Nah costs is restated by
          `HellNahDialog` at the moment of the click and in the sheet, so the
          card no longer repeats the same two sentences under every take on
          the board. The icon carries the accent and the stake itself stays
          `text-foreground`: a wager is a fact, not a direction. */}
      {staked && !compact && (
        <p className="mt-2.5 flex items-baseline gap-1.5 text-[13px]">
          <Coins
            className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-warning"
            aria-hidden="true"
          />
          <span className="text-muted-foreground">The bet</span>
          <span className="break-words text-foreground">{take.wager}</span>
        </p>
      )}

      {/* The compact face is one line under the take: the stake and when the
          window closes, with the two sides as buttons that carry their own
          counts. The board's card spells all of that out over three rows,
          which on Home made two takes a screen and a half. */}
      {compact && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            {staked && (
              <>
                <Coins className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                <span className="text-foreground">{take.wager}</span>
              </>
            )}
            {compactDeadline && (
              <>
                {staked && <span aria-hidden="true">·</span>}
                <span className="tabular">{compactDeadline}</span>
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <SideControl
              held={yeahed}
              canToggle={yeahed ? canWithdrawHellYeah(take, user) : canHellYeah(take, user)}
              showHeld={isPending(take)}
              onToggle={(event) => {
                event.stopPropagation();
                if (yeahed) onWithdrawHellYeah?.(take);
                else onHellYeah?.(take);
              }}
              pending={pending}
              Icon={ThumbsUp}
              label="Hell Yeah"
              heldLabel="Hell Yeah'd"
              count={yeahCount}
              compact
            />
            {staked && (
              <SideControl
                held={faded}
                canToggle={canToggle}
                showHeld={isPending(take)}
                onToggle={handleToggle}
                pending={pending}
                Icon={ThumbsDown}
                label="Hell Nah"
                heldLabel="Hell Nah'd"
                count={count}
                compact
              />
            )}
          </span>
        </div>
      )}

      {/* Hell Yeahs belong to every take — backing a call needs nothing
          staked — so this row is always here. The Hell Nah half of it only
          exists on a staked take: no wager, no other side, and a count of
          nothing would mean nothing. The fade count *is* always shown on a
          staked take, though — the author cannot fade their own, but they
          need to see the six people who did, because that is who they owe. */}
      {!compact && (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            {yeahCount} {yeahCount === 1 ? 'hell yeah' : 'hell yeahs'}
          </span>
          {staked && (
            <span className="inline-flex items-center gap-1.5">
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              {count} {count === 1 ? 'hell nah' : 'hell nahs'}
            </span>
          )}
        </span>

        <span className="flex items-center gap-2">
          <SideControl
            held={yeahed}
            canToggle={yeahed ? canWithdrawHellYeah(take, user) : canHellYeah(take, user)}
            showHeld={isPending(take)}
            onToggle={(event) => {
              event.stopPropagation();
              if (yeahed) onWithdrawHellYeah?.(take);
              else onHellYeah?.(take);
            }}
            pending={pending}
            Icon={ThumbsUp}
            label="Hell Yeah"
            heldLabel="Hell Yeah'd"
          />
          {staked && (
            <SideControl
              held={faded}
              canToggle={canToggle}
              showHeld={isPending(take)}
              onToggle={handleToggle}
              pending={pending}
              Icon={ThumbsDown}
              label="Hell Nah"
              heldLabel="Hell Nah'd"
            />
          )}
        </span>
      </div>
      )}

      {stakeRequests.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[13px] text-foreground">
          <Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {stakeRequests.length === 1
              ? `${nameOf(stakeRequests[0].userId)} staked ${stakeRequests[0].wager} on a Hell Yeah. Do you accept it?`
              : `${stakeRequests.length} Hell Yeah stakes are waiting for your answer.`}{' '}
            <span className="text-muted-foreground">Open the take to answer.</span>
          </span>
        </p>
      )}

      {/* Shown open or closed, and to the author as well: once the window
          shuts their bet is fixed, which is the thing they most want to know
          about their own take. */}
      {windowNote && !compact && <p className="mt-1.5 text-xs text-muted-foreground">{windowNote}</p>}
    </div>
  );
}

/**
 * One side's button. Absent when the viewer can neither join nor leave;
 * a static chip when they hold the side but its window has closed — their
 * Hell Yeah or Hell Nah survives the window that took the button away, and the
 * card has to keep saying so, because this is the one place a reader checks
 * whether they are on the hook for a take. Pending only (`showHeld`): a graded
 * take is frozen by its grade and says so in the status badge.
 */
function SideControl({ held, canToggle, showHeld, onToggle, pending, Icon, label, heldLabel, count = null, compact = false }) {
  // The compact face is the icon and the count, with the words in the
  // accessible name: "Hell Nah, 2" is the button and the tally at once.
  const name = held ? heldLabel : label;
  const face = compact ? (
    <>
      {held ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="tabular">{count ?? 0}</span>
    </>
  ) : held ? (
    <>
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      {heldLabel}
    </>
  ) : (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </>
  );

  if (canToggle) {
    return (
      <Button
        variant={held ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggle}
        disabled={pending}
        aria-label={compact ? `${name}, ${count ?? 0}` : undefined}
        className={cn('gap-1.5', compact && 'h-8 px-2.5')}
      >
        {face}
      </Button>
    );
  }

  if (held && showHeld) {
    return (
      <span
        aria-label={compact ? `${heldLabel}, ${count ?? 0}` : undefined}
        className={cn('inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[13px] text-muted-foreground', compact && 'h-8')}
      >
        {face}
      </span>
    );
  }

  // Nothing to press and nothing held: the compact face still shows the tally.
  if (!compact) return null;
  return (
    <span className="inline-flex h-8 items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
      <span className="sr-only">{label}s: </span>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="tabular">{count ?? 0}</span>
    </span>
  );
}

export default TakeCard;
