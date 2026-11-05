import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';

import { badgeVariants } from '../../ui/badge';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { formatPoints, formatScore } from '../../../utils/format';
import { PlayerAvatar } from '../../ui/player-avatar';
import { PlayerLink } from '../../players/PlayerLink';
import { BoxScoreButton, MatchupBoxScoreSheet } from '../../matchups/MatchupBoxScoreSheet';
import { useMatchupHistory, useMatchupStarters } from '../../../../hooks/queries/index.js';
import { teamOf } from '../../../../utils/playerImages.js';
import { bestGames } from '../../../../utils/home/bestGames.js';
import { RECENT_MEETINGS, phaseOf, summarizeMatchup } from '../../history/headtohead/matchupSummary';
import { describeSeries, meetingResult } from '../../../../utils/home/matchup.js';

const RESULT = {
  W: { label: 'W', tone: 'bg-success/15 text-success ring-success/30' },
  L: { label: 'L', tone: 'bg-destructive/15 text-destructive ring-destructive/30' },
  T: { label: 'T', tone: 'bg-muted text-muted-foreground ring-border' }
};

const RESULT_WORD = { W: 'win', L: 'loss', T: 'tie' };
const STANDING_LABEL = { lead: 'You lead', trail: 'You trail', level: 'Level' };
const PHASE_LABEL = { playoff: 'Playoffs', consolation: 'Consolation' };

/**
 * The viewer's all-time series against this week's opponent.
 *
 * Reads `useMatchupHistory` — the same cache entry History's head-to-head
 * detail reads — with the viewer's franchise first, so every row is oriented
 * with the viewer as team 1 and `summarizeMatchup`'s `sides[0]` is them. The
 * sentences come from `describeSeries`; this only lays them out.
 *
 * Two columns from `lg`: the series on the left (the record, set large, its
 * split by phase, the streak, the two games worth remembering), the meetings
 * on the right, the last `RECENT_MEETINGS` (eight), newest first and one per
 * row with the season leading — the year is what a reader scans for. "Full history" opens the same pairing on
 * History → Head-to-Head (`historyHref`, by franchise id).
 *
 * `gameType` is the type of the game the two are about to play, which picks
 * the phase the best games are drawn from (`bestGames`).
 *
 * Every meeting opens its box score (`MatchupBoxScoreSheet`): a row of the
 * list, and the date under each notable and best game. The date, never the
 * player, is the link on a best game.
 */
export function MatchupHistory({ viewerFranchiseId, opponentFranchiseId, historyHref = null, gameType = null }) {
  const { data: meetings, isPending, isError, refetch } = useMatchupHistory(
    viewerFranchiseId,
    opponentFranchiseId
  );

  const [boxScore, setBoxScore] = useState(null);
  const summary = useMemo(() => summarizeMatchup(meetings ?? []), [meetings]);
  const series = useMemo(() => describeSeries(summary), [summary]);

  if (!viewerFranchiseId || !opponentFranchiseId) {
    return <p className="text-sm text-muted-foreground">No franchise history to compare.</p>;
  }

  if (isPending) {
    return (
      <div role="status" aria-label="Loading series history" className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-2.5" aria-hidden="true">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: RECENT_MEETINGS }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load the series.{' '}
        <button type="button" onClick={() => refetch()} className="font-medium text-foreground underline underline-offset-2">
          Retry
        </button>
      </p>
    );
  }

  if (!series) {
    return <p className="text-sm text-muted-foreground">This is your first meeting.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <section aria-label="Series" className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">All-time series</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-[44px] font-semibold leading-none tracking-[-0.01em] tabular">
              {series.record}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                series.standing === 'lead' && 'text-success',
                series.standing === 'trail' && 'text-destructive',
                series.standing === 'level' && 'text-muted-foreground'
              )}
            >
              {STANDING_LABEL[series.standing]}
            </span>
          </p>
          {series.streak && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
              <Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              {series.streak}
            </p>
          )}
        </div>

        {series.phases.length > 1 && (
          <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
            {series.phases.map((phase) => (
              <div key={phase.label} className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted-foreground">{phase.label}</dt>
                <dd className="font-medium tabular">{phase.record}</dd>
              </div>
            ))}
          </dl>
        )}

        <dl className="grid grid-cols-2 gap-2">
          {summary.highestCombined && (
            <Notable
              label="Highest-scoring"
              value={formatScore(summary.highestCombined.value)}
              game={summary.highestCombined.game}
              onOpen={setBoxScore}
            />
          )}
          {summary.closest && (
            <Notable
              label="Closest"
              value={formatScore(summary.closest.value)}
              game={summary.closest.game}
              onOpen={setBoxScore}
            />
          )}
        </dl>

        <BestGames
          viewerFranchiseId={viewerFranchiseId}
          opponentFranchiseId={opponentFranchiseId}
          meetings={meetings}
          gameType={gameType}
          onOpen={setBoxScore}
        />
      </section>

      <section aria-labelledby="home-meetings-title" className="min-w-0">
        <h4 id="home-meetings-title" className="mb-1.5 text-[13px] font-medium text-muted-foreground">
          Last meetings
        </h4>
        <ol className="divide-y divide-border/60">
          {summary.recent.map((game) => {
            const result = RESULT[meetingResult(game)];
            const phase = phaseOf(game);
            return (
              <li key={`${game.year}-${game.week}`}>
                <button
                  type="button"
                  onClick={() => setBoxScore(game)}
                  aria-label={`${game.year} week ${game.week}: ${RESULT_WORD[result.label]}, ${formatScore(game.team1Score)} to ${formatScore(game.team2Score)}. Open the box score`}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-14 shrink-0">
                    <span className="block font-display text-xl font-semibold leading-none tabular">{game.year}</span>
                    <span className="block text-[11px] text-muted-foreground tabular">Week {game.week}</span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ring-1 ring-inset',
                      result.tone
                    )}
                    aria-label={result.label === 'W' ? 'Win' : result.label === 'L' ? 'Loss' : 'Tie'}
                  >
                    {result.label}
                  </span>
                  {PHASE_LABEL[phase] && (
                    <span className={cn(badgeVariants({ variant: 'outline' }), 'hidden shrink-0 px-1.5 py-0 text-[10px] sm:inline-flex')}>
                      {PHASE_LABEL[phase]}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-right text-sm tabular">
                    <span className="font-semibold">{formatScore(game.team1Score)}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      – {formatScore(game.team2Score)}
                    </span>
                  </span>
                  <ChevronRight className="-ml-1.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>

        {historyHref && (
          <Link
            to={historyHref}
            className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            Full head-to-head
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </section>

      <MatchupBoxScoreSheet game={boxScore} onClose={() => setBoxScore(null)} />
    </div>
  );
}

/** A game worth remembering: its figure, and when. */
function Notable({ label, value, game, onOpen }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span className="block font-display text-lg font-semibold leading-none tabular">{value}</span>
        <BoxScoreButton game={game} onOpen={onOpen} className="mt-1 block text-[11px] text-muted-foreground tabular">
          <span className="font-medium text-foreground">{game.year}</span> · Week {game.week}
        </BoxScoreButton>
      </dd>
    </div>
  );
}

const BEST_PHASE_LABEL = { regular: 'Regular season', playoff: 'Playoffs', all: 'All meetings' };

/**
 * The best player game on each side of the series: the starter who scored the
 * most in any meeting, in the phase the coming game is in. Viewer first, as
 * every row here is. A side with no lineup on file (2024 week 1) has no cell.
 */
function BestGames({ viewerFranchiseId, opponentFranchiseId, meetings, gameType, onOpen }) {
  const { data: starters, isPending, isError } = useMatchupStarters(
    viewerFranchiseId,
    opponentFranchiseId,
    meetings
  );
  const best = useMemo(
    () => bestGames(meetings ?? [], starters ?? [], { gameType }),
    [meetings, starters, gameType]
  );

  if (isError) return null;

  const heading = (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <h4 className="text-[13px] font-medium text-muted-foreground">Best games in this matchup</h4>
      {best && <span className="text-[11px] text-muted-foreground">{BEST_PHASE_LABEL[best.phase]}</span>}
    </div>
  );

  if (isPending) {
    return (
      <section aria-label="Best games in this matchup" role="status">
        {heading}
        <div className="grid grid-cols-2 gap-2" aria-hidden="true">
          <Skeleton className="h-[118px] w-full rounded-lg" />
          <Skeleton className="h-[118px] w-full rounded-lg" />
        </div>
      </section>
    );
  }

  if (!best) return null;

  return (
    <section aria-label="Best games in this matchup">
      {heading}
      <ul className="grid grid-cols-2 gap-2">
        {best.sides.map((entry, i) => (
          <li key={i} className="min-w-0">
            {entry ? <BestGame entry={entry} onOpen={onOpen} /> : (
              <div className="flex h-full items-center rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
                No lineups on file
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One side's best game: who, how many, for whom, and when. */
function BestGame({ entry, onOpen }) {
  const { player, points, teamName, year, week, result, game } = entry;
  const tone = RESULT[result];
  return (
    <div className="flex h-full flex-col rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <PlayerAvatar
          name={player.name}
          espnPlayerId={player.espnPlayerId}
          position={player.position}
          team={teamOf(player)}
          showTeam
          size={32}
        />
        <span className="font-display text-lg font-semibold leading-none tabular">
          {formatPoints(points)}
          <span className="ml-0.5 text-[11px] font-normal text-muted-foreground"> pts</span>
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-medium leading-tight" title={player.name ?? undefined}>
        <PlayerLink playerId={player.playerId} espnPlayerId={player.espnPlayerId} className="block max-w-full truncate">
          {player.name ?? 'Unknown player'}
        </PlayerLink>
      </p>
      <p className="truncate text-[11px] text-muted-foreground" title={teamName ?? undefined}>
        {teamName ?? '—'}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular">
        <BoxScoreButton game={game} onOpen={onOpen}>
          <span className="font-medium text-foreground">{year}</span> · Week {week}
        </BoxScoreButton>
        <span
          className={cn(
            'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold ring-1 ring-inset',
            tone.tone
          )}
          aria-label={result === 'W' ? 'Won that week' : result === 'L' ? 'Lost that week' : 'Tied that week'}
        >
          {tone.label}
        </span>
      </p>
    </div>
  );
}

export default MatchupHistory;
