import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { formatScore } from '../../utils/format';
import { useNflOpponentMap, useWeekPlayerStats } from '../../../hooks/queries/index.js';
import { LineupSkeleton, TeamLineup } from '../schedule/LineupPanel';
import { meetingWinner, phaseOf } from '../history/headtohead/matchupSummary';

const PHASE_LABEL = { playoff: 'Playoffs', consolation: 'Consolation' };

/**
 * A finished matchup's box score: both lineups, every player's points, in a
 * bottom sheet at every width, as Schedule's bracket opens one.
 *
 * Past tense only, so it reads `player_week_stats` straight
 * (`useWeekPlayerStats`), never `useLineupsForWeek`: that hook decides past
 * from present by comparing the week with the active season's, and a 2021 week
 * 14 is not "this week" just because the number is larger. The rows are the
 * stored ones, backfilled to 2020; a week ESPN has no rosters for (2024 week 1)
 * says so per side rather than showing nothing.
 *
 * `game` is a meeting in `getMatchupHistory`'s shape (`seasonId`, `year`,
 * `week`, `team1Id`/`team2Id`, names and scores); null closes the sheet.
 * `names` overrides the team names, for a caller that masks them.
 */
export function MatchupBoxScoreSheet({ game, names = null, onClose }) {
  return (
    <Sheet open={Boolean(game)} onOpenChange={(open) => !open && onClose?.()}>
      <SheetContent side="bottom" className="overflow-y-auto">
        {game && <BoxScore game={game} names={names} />}
      </SheetContent>
    </Sheet>
  );
}

function BoxScore({ game, names }) {
  const { data: rowsByTeam, isLoading } = useWeekPlayerStats(game.seasonId, game.week);
  // The NFL calendar is keyed by year; for every season here the ESPN year is the year.
  const { data: opponents = {} } = useNflOpponentMap(game.nflSeasonYear ?? game.year, game.week);

  const phase = phaseOf(game);
  const winner = meetingWinner(game);
  const sides = [
    { teamId: game.team1Id, name: names?.[0] ?? game.team1Name, score: game.team1Score, franchiseId: game.team1FranchiseId },
    { teamId: game.team2Id, name: names?.[1] ?? game.team2Name, score: game.team2Score, franchiseId: game.team2FranchiseId }
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 font-display text-xl tracking-tight">
          <span className="tabular">
            {game.year} · Week {game.week}
          </span>
          {PHASE_LABEL[phase] && (
            <Badge variant={phase === 'playoff' ? 'secondary' : 'outline'} className="px-1.5 py-0 text-[10px]">
              {PHASE_LABEL[phase]}
            </Badge>
          )}
        </SheetTitle>
        <SheetDescription>Box score: both lineups and every player&apos;s points.</SheetDescription>
      </SheetHeader>

      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
        aria-label={`${sides[0].name} ${formatScore(sides[0].score)}, ${sides[1].name} ${formatScore(sides[1].score)}`}
      >
        {sides.map((side, i) => (
          <div
            key={side.teamId ?? i}
            className={cn('min-w-0', i === 0 ? 'order-1' : 'order-3 text-right')}
          >
            <p className="truncate text-[13px] font-medium" title={side.name ?? undefined}>{side.name}</p>
            <p
              className={cn(
                'font-display text-[28px] font-semibold leading-none tracking-[-0.01em] tabular',
                winner !== null && winner !== i && 'text-muted-foreground'
              )}
            >
              {formatScore(side.score)}
            </p>
          </div>
        ))}
        <span className="order-2 text-xs font-medium text-muted-foreground">
          {winner === null ? 'Tie' : 'Final'}
        </span>
      </div>

      {isLoading ? (
        <LineupSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-5 border-t border-border/60 pt-3.5 sm:grid-cols-2">
          {sides.map((side, i) => (
            <TeamLineup
              key={side.teamId ?? i}
              team={side.franchiseId ? { franchiseId: side.franchiseId } : null}
              teamName={side.name}
              rows={rowsByTeam?.[side.teamId] ?? []}
              opponents={opponents}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The control that opens a box score: a meeting's "2023 · Week 5", or whatever
 * the caller renders inside it. A button, so it never nests inside a link, and
 * named for what it opens, since "Week 5" alone says nothing to a screen reader.
 */
export function BoxScoreButton({ game, onOpen, className, children }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(game);
      }}
      aria-label={`Open the ${game.year} week ${game.week} box score`}
      className={cn(
        'rounded-sm text-left underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {children}
    </button>
  );
}

export default MatchupBoxScoreSheet;
