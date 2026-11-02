import { useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { ShareBar } from '../ui/field-backdrop';
import { LiveDot } from '../ui/live-dot';
import { NumberText, RecordText } from '../ui/number-text';
import { LiveSideNote, PlayerPoints } from '../ui/player-points';
import { getMaskedOwnerName, getMaskedTeamName } from '../../utils/displayNameUtils';
import { getTeamColor } from '../../utils/teamColors';
import { getUserTeamHighlightClasses, isUserTeam } from '../../utils/userTeamUtils';
import { cn } from '../../lib/utils';
import { overlayGame } from '../../../utils/liveOverlay.js';
import { starterTotal, totalAsPoints } from '../../../utils/lineupTotals.js';
import { WinnerMark } from './LeaguePickSplit.jsx';
import { isByeGame } from './pickSplit.js';
import { TeamRoster, rosterFor, rosterSize } from './TeamRoster.jsx';

const EMPTY_ROSTER = { starters: [], bench: [], injured: [] };

/**
 * One matchup: the decision, the score, and everything a reader wants beside it.
 *
 * The page used to be two lists over the same games, "Research matchups" and
 * then a card with the two buttons, and a finished game fell off entirely. This
 * is the one card, on Make Picks, Results and the home panel. Each side is still
 * the radio button, now carrying the owner, the record and the score (projected
 * before kickoff, live during, final after). Under the pair: how the viewer's
 * pick stands, how the league picked once the window has closed, and the
 * lineups. A finished game stays, locked, with the W on its winner.
 *
 * `compact` is the home panel's density: the same sides and chip, no lineups.
 *
 * @param {object} props
 * @param {object} props.game - a pick'em game with `team1`/`team2`
 * @param {number|null} props.number - the game's position among the week's matchups
 * @param {string|null} props.selectedTeamId
 * @param {boolean} props.canPick - the window and the viewer allow a pick at all
 * @param {(teamId: string) => void} [props.onPick]
 * @param {object} props.board - from `useMatchupBoard`
 * @param {object|null} [props.split] - this game's `PickSplitMatchup`, once it may be shown
 * @param {{ user: object|null, isAdmin: boolean, teamOwnerNames: Array }} props.viewer
 * @param {boolean} [props.compact]
 */
export function MatchupPickCard({
  game,
  number,
  selectedTeamId,
  canPick,
  onPick,
  board,
  split = null,
  viewer,
  compact = false
}) {
  const isBye = isByeGame(game);
  const liveSides = overlayGame(game, board.live).live;
  const winnerId = game.isCompleted ? game.winnerTeamId ?? null : null;
  const pickable = canPick && !game.isCompleted;
  const outlook = board.outlooks?.[game.id] ?? null;

  const side = (team, score, live) => (
    <PickOption
      team={team}
      score={score}
      rows={board.rowsByTeam?.[team?.id]}
      live={live}
      loading={board.isLoading}
      isSelected={selectedTeamId === team?.id}
      isWinner={winnerId != null && winnerId === team?.id}
      isBye={isBye}
      disabled={isBye || !pickable}
      onSelect={() => pickable && onPick?.(team.id)}
      viewer={viewer}
      compact={compact}
    />
  );

  const body = (
    <>
      <div
        role="radiogroup"
        aria-label={isBye ? 'Bye week' : `Pick the winner of game ${number}`}
        className={cn(
          'grid min-w-0 items-stretch gap-2',
          isBye ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
        )}
      >
        {side(game.team1, game.team1Score, liveSides?.team1)}
        {!isBye && (
          <>
            <span aria-hidden="true" className="self-center text-center text-xs font-medium uppercase text-muted-foreground">
              vs
            </span>
            {side(game.team2, game.team2Score, liveSides?.team2)}
          </>
        )}
      </div>

      {outlook && <OutlookChip outlook={outlook} playing={Boolean(board.live?.live)} />}
      {split && <LeagueShare matchup={split} viewer={viewer} />}
    </>
  );

  if (compact) return <div className="space-y-2">{body}</div>;

  const isViewerGame = isUserTeam(game.team1, viewer.user) || isUserTeam(game.team2, viewer.user);

  return (
    <Card className={cn('overflow-hidden', isBye && 'bg-muted/30', getUserTeamHighlightClasses(isViewerGame))}>
      <CardContent className="space-y-3 p-3.5 sm:p-4">
        <p className="text-[13px] font-medium text-muted-foreground">
          {isBye ? <Badge variant="warning">BYE</Badge> : `Game ${number}`}
        </p>
        {body}
      </CardContent>
      <LineupsDisclosure game={game} isBye={isBye} board={board} viewer={viewer} />
    </Card>
  );
}

/**
 * How the viewer's own pick stands. `playing` says whether a game is on: the dot
 * pulses for that and sits still between kickoffs.
 */
function OutlookChip({ outlook, playing }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Badge variant={outlook.variant} className="gap-1.5">
        {outlook.probability != null && <LiveDot done={!playing} />}
        <span className="sr-only">Your pick: </span>
        {outlook.label}
      </Badge>
      {outlook.detail && <span className="tabular">{outlook.detail}</span>}
    </div>
  );
}

/**
 * How the league picked, once the window has closed: each side's share either
 * end of one bar, which replaces the fourteen boxes that sat above the page.
 * A game nobody picked has no split, so it draws nothing.
 */
function LeagueShare({ matchup, viewer }) {
  const [first, second] = matchup.sides;
  if (first.share == null) return null;

  const nameOf = (side) => getMaskedTeamName(side.team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className={cn(!first.trails && 'text-foreground')}>
          <span className="sr-only">{nameOf(first)}: </span>
          <NumberText variant="percent" value={first.share} />
        </span>
        <span>League&apos;s picks</span>
        <span className={cn(!second.trails && 'text-foreground')}>
          <span className="sr-only">{nameOf(second)}: </span>
          <NumberText variant="percent" value={second.share} />
        </span>
      </div>
      <ShareBar share={first.share} left={first.team} right={second.team} className="mt-1" />
    </div>
  );
}

/** The two lineups, fetched already and rendered only once somebody asks. */
function LineupsDisclosure({ game, isBye, board, viewer }) {
  const [open, setOpen] = useState(false);

  const team1Roster = rosterFor(board.rowsByTeam?.[game.team1?.id]);
  const team2Roster = isBye ? EMPTY_ROSTER : rosterFor(board.rowsByTeam?.[game.team2?.id]);
  const hasRows = rosterSize(team1Roster) > 0 || rosterSize(team2Roster) > 0;
  const nameOf = (team) => getMaskedTeamName(team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames);

  return (
    <div className="border-t border-border/60">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/40"
      >
        {open ? 'Hide lineups' : 'Lineups'}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div className="border-t border-border/60 p-3">
          {!hasRows ? (
            <p className="text-sm text-muted-foreground">No roster has been synced for this team yet.</p>
          ) : (
            <div className={cn('grid gap-4', !isBye && 'grid-cols-1 sm:grid-cols-2')}>
              <TeamRoster roster={team1Roster} teamName={nameOf(game.team1)} opponents={board.opponents} />
              {!isBye && (
                <TeamRoster roster={team2Roster} teamName={nameOf(game.team2)} opponents={board.opponents} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A side's number. An imported score always wins. Until there is one the
 * lineup's starter total stands in, labelled by `PlayerPoints`: "proj" before
 * kickoff, "live" and "so far" while the games are on. A span throughout: a pick
 * is a button, so nothing inside it may be a block.
 */
function SideScore({ score, rows, live, loading, compact }) {
  const figure = compact ? 'text-[17px]' : 'text-[21px]';
  const className = cn('leading-none tracking-[-0.01em]', figure);

  if (score != null) return <PlayerPoints actualPoints={Number(score)} display className={className} />;
  if (loading) return <span aria-hidden="true" className="inline-block h-5 w-14 animate-pulse rounded bg-muted" />;
  if (!rows?.length) return null;

  const total = starterTotal(rows);

  return (
    <>
      <PlayerPoints {...totalAsPoints(total, live?.points)} display className={cn('justify-center', className)} />
      <LiveSideNote as="span" total={total} projected={live?.projected} className="mt-1 block" />
    </>
  );
}

/**
 * One team, as a choice.
 *
 * Selection reads three ways at once: a check mark, the border, and a tint. The
 * tint is the *team's* colour, so picking a team looks like picking that team
 * rather than like filling in a form field. These are real radios in a real
 * group, so a screen reader is told which of the two is the answer.
 */
function PickOption({ team, score, rows, live, loading, isSelected, isWinner, isBye, disabled, onSelect, viewer, compact }) {
  const color = getTeamColor(team);
  const { user, isAdmin, teamOwnerNames } = viewer;
  const hasRecord = team?.wins != null && Number(team.wins) + Number(team.losses ?? 0) + Number(team.ties ?? 0) > 0;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex min-w-0 items-center justify-center rounded-lg border-2 text-center transition-colors',
        compact ? 'min-h-12 p-2' : 'min-h-16 p-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isBye && 'cursor-not-allowed border-border bg-muted/50 opacity-60',
        !isBye && isSelected && ['border-current bg-current/10', color.text],
        !isBye && !isSelected && 'border-border',
        !isBye && !isSelected && !disabled && 'hover:border-foreground/30 hover:bg-accent/50',
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
          className={cn('absolute right-1.5 top-1.5', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
          aria-hidden="true"
        />
      )}

      <span className="block w-full min-w-0">
        <span
          className={cn(
            'block truncate font-semibold',
            compact ? 'text-[13px]' : 'text-sm sm:text-base',
            !isSelected && 'text-foreground'
          )}
        >
          {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
          {hasRecord && (
            <>
              {' · '}
              <RecordText wins={team.wins} losses={team.losses} ties={team.ties} />
            </>
          )}
        </span>
        {isBye ? (
          <span className="mt-1 block text-xs font-semibold text-warning">On bye</span>
        ) : (
          <span className={cn('block text-foreground', compact ? 'mt-1' : 'mt-2')}>
            <SideScore score={score} rows={rows} live={live} loading={loading} compact={compact} />
          </span>
        )}
      </span>
    </button>
  );
}

export default MatchupPickCard;
