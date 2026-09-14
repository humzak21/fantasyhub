import React, { useMemo } from 'react';
import { ArrowLeft, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { EmptyState } from '../../ui/empty-state';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatPct, formatRecord, formatScore } from '../../../utils/format';
import { useMatchupHistory } from '../../../../hooks/queries/index.js';
import { canViewFullData, getMaskedFranchiseName } from '../utils/privacyHelpers';
import { phaseOf, summarizeMatchup } from './matchupSummary';

const PHASE_LABEL = { regular: 'Regular season', playoff: 'Playoffs', consolation: 'Consolation' };

/** Which side leads a comparison: 0, 1, or null for level. */
const leader = (a, b, higherIsBetter = true) => {
  if (a == null || b == null || a === b) return null;
  return (a > b) === higherIsBetter ? 0 : 1;
};

/** One meeting: both scores, the winner's in the success tone, the loser's receding. */
function MeetingRow({ game, showYear = false }) {
  const winner = game.team1Score > game.team2Score ? 0 : game.team2Score > game.team1Score ? 1 : null;
  const phase = phaseOf(game);
  const tone = (side) =>
    winner === side ? 'font-semibold text-success' : winner === null ? 'text-foreground' : 'text-muted-foreground';

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 py-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_auto_minmax(0,1fr)]">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          {showYear ? `${game.year} · ` : ''}Wk {game.week}
        </span>
        {phase !== 'regular' && (
          <Badge variant={phase === 'playoff' ? 'secondary' : 'outline'} className="shrink-0 px-1.5 py-0 text-[10px]">
            {phase === 'playoff' ? 'Playoffs' : 'Consol.'}
          </Badge>
        )}
      </span>
      <span className={cn('tabular text-right', tone(0))}>{formatScore(game.team1Score)}</span>
      <span className="text-center text-[10px] uppercase tracking-[0.06em] text-muted-foreground">–</span>
      <span className={cn('tabular', tone(1))}>{formatScore(game.team2Score)}</span>
    </li>
  );
}

/** A notable game, told as its figure and the meeting it came from. */
function NotableGame({ label, value, game }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold leading-none tracking-[-0.01em]">{value}</p>
      {game && (
        <p className="mt-2 text-xs text-muted-foreground tabular">
          {formatScore(game.team1Score)}–{formatScore(game.team2Score)} · Wk {game.week}, {game.year}
          {phaseOf(game) !== 'regular' && ` · ${PHASE_LABEL[phaseOf(game)]}`}
        </p>
      )}
    </div>
  );
}

/**
 * Two franchises' whole rivalry: the series, how each side fared by phase, the
 * games worth remembering, and every meeting.
 *
 * The numbers are `summarizeMatchup`'s; this lays them out as a tale of the
 * tape — franchise 1 on the left, franchise 2 on the right, the measure between
 * them — so a phone reads the same three columns a desktop does.
 */
const MatchupDetail = ({
  franchise1Id,
  franchise2Id,
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onBack = () => {}
}) => {
  const { data: matchups = [], isLoading } = useMatchupHistory(franchise1Id, franchise2Id);

  const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
  const franchisesById = new Map(franchises.map((franchise) => [franchise.id, franchise]));
  const ids = [franchise1Id, franchise2Id];
  const names = ids.map((id) => getMaskedFranchiseName(franchisesById.get(id), user, isAdmin, teamOwnerNames));
  const avatar = (i) => {
    const franchise = franchisesById.get(ids[i]);
    return fullData && franchise
      ? { franchiseId: ids[i], owner_name: franchise.owner_name }
      : { franchiseId: ids[i], name: names[i] };
  };

  const summary = useMemo(() => summarizeMatchup(matchups), [matchups]);

  const byYear = useMemo(() => {
    const groups = new Map();
    for (const game of matchups) {
      if (!groups.has(game.year)) groups.set(game.year, []);
      groups.get(game.year).push(game);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, games]) => [year, [...games].sort((a, b) => b.week - a.week)]);
  }, [matchups]);

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack}>
      <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
      Back to matrix
    </Button>
  );

  if (isLoading && matchups.length === 0) {
    return (
      <div className="space-y-6">
        {back}
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" aria-label="Loading matchup" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        {back}
        <Card>
          <EmptyState icon={Target} title={`${names[0]} and ${names[1]} have never met`} />
        </Card>
      </div>
    );
  }

  const [first, second] = summary.sides;
  const tape = [
    {
      label: 'Series',
      values: [formatRecord(first), formatRecord(second)],
      lead: leader(first.wins, second.wins)
    },
    {
      label: 'Regular season',
      values: [formatRecord(first.byPhase.regular), formatRecord(second.byPhase.regular)],
      lead: leader(first.byPhase.regular.wins, second.byPhase.regular.wins)
    },
    summary.phases.playoff > 0 && {
      label: 'Playoffs',
      values: [formatRecord(first.byPhase.playoff), formatRecord(second.byPhase.playoff)],
      lead: leader(first.byPhase.playoff.wins, second.byPhase.playoff.wins)
    },
    summary.phases.consolation > 0 && {
      label: 'Consolation',
      values: [formatRecord(first.byPhase.consolation), formatRecord(second.byPhase.consolation)],
      lead: leader(first.byPhase.consolation.wins, second.byPhase.consolation.wins)
    },
    { label: 'Win %', values: [formatPct(first.winPct), formatPct(second.winPct)], lead: leader(first.winPct, second.winPct) },
    { label: 'Points for', values: [formatScore(first.points), formatScore(second.points)], lead: leader(first.points, second.points) },
    {
      label: 'Average score',
      values: [formatScore(first.averagePoints), formatScore(second.averagePoints)],
      lead: leader(first.averagePoints, second.averagePoints)
    },
    {
      label: 'Highest score',
      values: [formatScore(first.highScore?.value), formatScore(second.highScore?.value)],
      lead: leader(first.highScore?.value, second.highScore?.value)
    },
    {
      label: 'Biggest win',
      values: [first.biggestWin, second.biggestWin].map((win) => (win ? `+${formatScore(win.value)}` : '—')),
      lead: leader(first.biggestWin?.value ?? 0, second.biggestWin?.value ?? 0)
    },
    {
      label: 'Longest win streak',
      values: [first.longestStreak, second.longestStreak].map((run) => (run ? String(run.length) : '—')),
      lead: leader(first.longestStreak?.length ?? 0, second.longestStreak?.length ?? 0)
    }
  ].filter(Boolean);

  const streak = summary.currentStreak;
  const streakLine = streak
    ? streak.length === 1
      ? `${names[streak.side]} won the last meeting.`
      : `${names[streak.side]} has won the last ${streak.length} meetings.`
    : 'The last meeting was a tie.';

  return (
    <div className="space-y-6">
      {back}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {names[0]} vs {names[1]}
            </span>
          </CardTitle>
          <CardDescription>
            {summary.totalGames} {summary.totalGames === 1 ? 'meeting' : 'meetings'} · {streakLine}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* The series */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
            {[0, 1].map((i) => (
              <div
                key={ids[i]}
                className={cn('flex min-w-0 flex-col items-center gap-2 text-center', i === 0 ? 'order-1' : 'order-3')}
              >
                <TeamAvatar team={avatar(i)} size="md" />
                <span className="w-full truncate text-sm font-medium">{names[i]}</span>
                <span
                  className={cn(
                    'font-display text-4xl font-semibold leading-none tracking-[-0.01em] tabular',
                    leader(first.wins, second.wins) === i ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {summary.sides[i].wins}
                </span>
              </div>
            ))}
            <span className="order-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {first.ties > 0 ? `${first.ties} ${first.ties === 1 ? 'tie' : 'ties'}` : 'wins'}
            </span>
          </div>

          {/* Tale of the tape */}
          <dl className="divide-y divide-border/60 rounded-lg border border-border">
            {tape.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-sm sm:px-4">
                <dd className={cn('tabular text-right', row.lead === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {row.values[0]}
                </dd>
                <dt className="text-center text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {row.label}
                </dt>
                <dd className={cn('tabular', row.lead === 1 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {row.values[1]}
                </dd>
              </div>
            ))}
          </dl>

          {/* Notable games */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NotableGame
              label="Highest-scoring meeting"
              value={formatScore(summary.highestCombined.value)}
              game={summary.highestCombined.game}
            />
            <NotableGame
              label="Closest meeting"
              value={summary.closest ? formatScore(summary.closest.value) : '—'}
              game={summary.closest?.game}
            />
            <NotableGame label="Average combined score" value={formatScore(summary.averageCombined)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent meetings</CardTitle>
          <CardDescription>
            {names[0]} on the left. The last {summary.recent.length}, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-border/60">
            {summary.recent.map((game) => (
              <MeetingRow key={game.id} game={game} showYear />
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Every meeting</CardTitle>
          <CardDescription>{names[0]} on the left.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {byYear.map(([year, games]) => {
            const seasonSummary = summarizeMatchup(games);
            return (
              <section key={year} aria-labelledby={`meetings-${year}`}>
                <h3 id={`meetings-${year}`} className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  {year}
                  <span className="text-xs font-normal text-muted-foreground tabular">
                    {formatRecord(seasonSummary.sides[0])}
                  </span>
                </h3>
                <ol className="divide-y divide-border/60">
                  {games.map((game) => (
                    <MeetingRow key={game.id} game={game} />
                  ))}
                </ol>
              </section>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default MatchupDetail;
