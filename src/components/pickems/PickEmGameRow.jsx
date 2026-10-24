import { CheckCircle2 } from 'lucide-react';

import { Badge } from '../ui/badge';
import { getMaskedOwnerName, getMaskedTeamName } from '../../utils/displayNameUtils';
import { getTeamColor } from '../../utils/teamColors';
import { cn } from '../../lib/utils';
import { isByeGame } from './pickSplit.js';
import { WinnerMark } from './LeaguePickSplit.jsx';

/**
 * One matchup as a choice: a label, then the two teams as a radio group.
 *
 * Lifted out of `PickEmsSubmission` so the home page's pick'ems widget renders
 * the same row rather than a copy of it. `compact` is the widget's density —
 * no label column (the radio group keeps its name), shorter buttons, and the
 * buttons stay fluid at every width, two halves of the card.
 *
 * @param {object} props
 * @param {object} props.game - a pick'em game with `team1`/`team2`
 * @param {number|null} props.number - the game's position among selectable games
 * @param {string|null} props.selectedTeamId
 * @param {boolean} props.canPick
 * @param {(teamId: string) => void} props.onPick
 * @param {boolean} [props.compact]
 * @param {boolean} [props.showResult] - mark the winner of a finished game,
 *   with the same `WinnerMark` Results uses (a completed game with a winner
 *   only — a tie or an unscored game marks nobody)
 */
export function PickEmGameRow({
  game,
  number,
  selectedTeamId,
  canPick,
  onPick,
  user,
  isAdmin,
  teamOwnerNames,
  compact = false,
  showResult = false
}) {
  const isBye = isByeGame(game);
  const winnerId = showResult && game.isCompleted ? game.winnerTeamId ?? null : null;
  const choose = (teamId) => canPick && onPick(teamId);

  return (
    /*
      This row used to be a hard 632px: a w-16 label, w-60 + w-8 + w-60, and
      three fixed gaps. At 375px (~310px usable) the second team button sat
      entirely off-screen behind the root's overflow-x: hidden, so nobody could
      pick team 2 on a phone.

      It is fluid below sm: and pinned to the old track widths from sm: up, so
      the desktop layout is byte-for-byte what it was. `compact` stays fluid.
    */
    <div className={cn('flex flex-col gap-3', !compact && 'sm:flex-row sm:items-center sm:gap-6')}>
      {!compact && (
        <div className="text-sm text-muted-foreground font-medium sm:w-16 sm:shrink-0">
          {isBye ? (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
              BYE
            </Badge>
          ) : (
            `Game ${number}`
          )}
        </div>
      )}

      <div
        role="radiogroup"
        aria-label={isBye ? 'Bye week' : `Pick the winner of game ${number}`}
        className={cn(
          'grid w-full min-w-0 items-stretch gap-2',
          !compact && 'sm:w-auto sm:gap-4',
          isBye
            ? cn('grid-cols-1', !compact && 'sm:grid-cols-[15rem]')
            : cn(
                'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
                !compact && 'sm:grid-cols-[15rem_2rem_15rem]'
              )
        )}
      >
        <PickOption
          team={game.team1}
          isSelected={selectedTeamId === game.team1.id}
          isBye={isBye}
          disabled={isBye || !canPick}
          onSelect={() => choose(game.team1.id)}
          user={user}
          isAdmin={isAdmin}
          teamOwnerNames={teamOwnerNames}
          compact={compact}
          isWinner={winnerId != null && winnerId === game.team1.id}
        />

        {!isBye && (
          <>
            <div className="self-center text-center text-xs font-medium uppercase text-muted-foreground">
              vs
            </div>

            <PickOption
              team={game.team2}
              isSelected={selectedTeamId === game.team2.id}
              disabled={!canPick}
              onSelect={() => choose(game.team2.id)}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              compact={compact}
              isWinner={winnerId != null && winnerId === game.team2.id}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One team, as a choice.
 *
 * The two buttons this replaces were near-identical copies whose selected
 * state was a solid blue fill and nothing else. That is a colour-only
 * distinction — invisible to anyone who cannot separate the two hues, and
 * invisible to assistive technology, because these were plain `<button>`s in a
 * plain `<div>`: no radio role, no `aria-checked`, no group, so a screen
 * reader was given two unrelated buttons with no indication that one of them
 * was the answer.
 *
 * Selection now reads three ways at once: a check mark, the border, and a
 * tint. The tint is the *team's* colour, so picking a team looks like picking
 * that team rather than like filling in a form field.
 */
export function PickOption({
  team,
  isSelected,
  isBye,
  disabled,
  onSelect,
  user,
  isAdmin,
  teamOwnerNames,
  compact = false,
  isWinner = false
}) {
  const color = getTeamColor(team);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex min-w-0 items-center justify-center rounded-lg border-2 text-center transition-colors',
        compact ? 'min-h-12 p-2' : 'min-h-16 p-3 sm:p-4',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isBye && 'cursor-not-allowed border-border bg-muted/50 opacity-60',
        !isBye && isSelected && ['border-current bg-current/10', color.text],
        !isBye && !isSelected && 'border-border hover:border-foreground/30 hover:bg-accent/50',
        disabled && !isBye && 'cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      {isWinner && (
        <>
          <WinnerMark className="absolute left-1.5 top-1.5 px-1 py-0 text-[10px]" />
          <span className="sr-only">Won.</span>
        </>
      )}
      {isSelected && (
        <CheckCircle2
          className={cn('absolute h-4 w-4', compact ? 'right-1.5 top-1.5 h-3.5 w-3.5' : 'right-2 top-2')}
          aria-hidden="true"
        />
      )}

      <div className="w-full min-w-0">
        <div
          className={cn(
            'truncate font-semibold',
            compact ? 'text-[13px]' : 'text-sm sm:text-base',
            !isSelected && 'text-foreground'
          )}
        >
          {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
        </div>
        {isBye && <div className="mt-1 text-xs font-semibold text-warning">On bye</div>}
      </div>
    </button>
  );
}

export default PickEmGameRow;
