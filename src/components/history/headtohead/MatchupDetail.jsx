import React, { useMemo } from 'react';
import { ArrowLeft, Flame, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { EmptyState } from '../../ui/empty-state';
import { FieldBackdrop, ShareBar } from '../../ui/field-backdrop';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatPct, formatRecord, formatScore } from '../../../utils/format';
import { getTeamColor } from '../../../utils/teamColors';
import { useMatchupHistory } from '../../../../hooks/queries/index.js';
import { canViewFullData, getMaskedFranchiseName } from '../utils/privacyHelpers';
import { meetingWinner, phaseOf, summarizeMatchup } from './matchupSummary';
import { TeamLink } from '../../ui/team-link';

const PHASE_LABEL = { regular: 'Regular season', playoff: 'Playoffs', consolation: 'Consolation' };

/**
 * Three columns, used by everything on the page: franchise 1, the thing being
 * compared, franchise 2. The names stay on screen in the bar at the top, so a
 * score's column says whose it is and nothing has to say "on the left".
 */
const SIDES_GRID = 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center';

/** Which side leads a comparison: 0, 1, or null for level. */
const leader = (a, b, higherIsBetter = true) => {
  if (a == null || b == null || a === b) return null;
  return (a > b) === higherIsBetter ? 0 : 1;
};

/**
 * Each side's share of a pair of figures, for the bars on the tape: the two
 * reach out from the middle in proportion. Null when there is nothing to divide.
 */
const shares = (a, b) => {
  const total = (a ?? 0) + (b ?? 0);
  return total > 0 ? [((a ?? 0) / total) * 100, ((b ?? 0) / total) * 100] : null;
};

/**
 * The franchises' names, held under the app header for the whole page. Sticky
 * rather than repeated: every section below reads against these two columns.
 * The series comes along, because it is what the rest of the page is explaining.
 */
function NamesBar({ names, ids, avatar, wins, ties }) {
  return (
    <div
      className={cn(
        // The app header is h-14, h-16 from sm, plus its 1px rule.
        'sticky top-[calc(3.5rem+1px)] z-20 overflow-hidden rounded-t-xl border border-border bg-card px-3 py-2 sm:px-6',
        'shadow-[0_6px_12px_-6px_rgb(0_0_0/0.6)] sm:top-[calc(4rem+1px)]'
      )}
    >
      <FieldBackdrop left={avatar(0)} right={avatar(1)} />
      <div className={cn(SIDES_GRID, 'relative gap-2 sm:gap-4')}>
        {[0, 1].map((i) => (
          <div
            key={ids[i]}
            className={cn(
              'flex min-w-0 items-center gap-2',
              i === 0 ? 'order-1' : 'order-3 flex-row-reverse text-right'
            )}
          >
            <TeamAvatar team={avatar(i)} size="sm" className="shrink-0" />
            <TeamLink
              franchiseId={ids[i]}
              title={names[i]}
              className="line-clamp-2 text-[13px] font-semibold leading-tight sm:text-sm"
            >
              {names[i]}
            </TeamLink>
          </div>
        ))}
        <span className="order-2 whitespace-nowrap font-display text-lg font-semibold leading-none tracking-[-0.01em] tabular">
          {wins[0]}–{wins[1]}
          {ties > 0 && <span className="text-muted-foreground">–{ties}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * Every meeting as one strip, oldest first: each block in the winner's colour.
 * The rivalry's shape at a glance, runs and all. A tie is left blank.
 */
function ResultStrip({ games, avatar, names }) {
  const description = games
    .map((game) => {
      const winner = meetingWinner(game);
      return `${game.year} week ${game.week}: ${winner === null ? 'tie' : names[winner]}`;
    })
    .join('; ');

  return (
    <div role="img" aria-label={`Winner of each meeting, oldest first. ${description}`} className="flex flex-wrap gap-1">
      {games.map((game) => {
        const winner = meetingWinner(game);
        return (
          <span
            key={game.id}
            title={`${game.year} · Week ${game.week}`}
            className={cn('h-3 w-3 rounded-[3px] sm:h-3.5 sm:w-3.5', winner === null && 'bg-muted')}
            style={winner === null ? undefined : { background: getTeamColor(avatar(winner)).value }}
          />
        );
      })}
    </div>
  );
}

/** One row of the tape: the figures either side of the measure, bars reaching out. */
function TapeRow({ label, values, lead, split, avatar }) {
  const figure = (side) => (
    <dd className={cn('min-w-0', side === 0 && 'text-right')}>
      <span
        className={cn(
          'tabular text-[15px] sm:text-base',
          lead === side ? 'font-semibold text-foreground' : 'text-muted-foreground'
        )}
      >
        {values[side]}
      </span>
      {split && (
        <span className={cn('mt-1 flex h-1', side === 0 && 'justify-end')} aria-hidden="true">
          <span
            className={cn('h-full rounded-full', lead !== side && 'opacity-40')}
            style={{ width: `${split[side]}%`, background: getTeamColor(avatar(side)).value }}
          />
        </span>
      )}
    </dd>
  );

  return (
    <div className={cn(SIDES_GRID, 'gap-3 py-2.5 sm:gap-5')}>
      {figure(0)}
      <dt className="w-24 text-center text-[13px] font-medium leading-tight text-muted-foreground sm:w-32">{label}</dt>
      {figure(1)}
    </div>
  );
}

/**
 * One meeting, in the page's two columns: each score under its franchise, the
 * when between them. The row washes in from the winner's side in their colour,
 * so a season reads as who won before a single number does.
 */
function MeetingRow({ game, avatar }) {
  const winner = meetingWinner(game);
  const phase = phaseOf(game);
  const score = (side) => (
    <span
      className={cn(
        'tabular text-[15px] sm:text-base',
        side === 1 && 'text-right',
        winner === side ? 'font-semibold text-foreground' : 'text-muted-foreground'
      )}
    >
      {formatScore(side === 0 ? game.team1Score : game.team2Score)}
    </span>
  );

  const wash =
    winner === null
      ? undefined
      : `linear-gradient(${winner === 0 ? '90deg' : '270deg'}, color-mix(in oklab, ${getTeamColor(avatar(winner)).value} 22%, transparent), transparent 42%)`;

  return (
    <li className={cn(SIDES_GRID, 'min-h-11 gap-3 rounded-md px-2.5 py-1.5')} style={{ backgroundImage: wash }}>
      {score(0)}
      <span className="flex flex-col items-center gap-0.5 text-center">
        <span className="flex items-baseline gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <span className="tabular">Wk {game.week}</span>
        </span>
        {phase !== 'regular' && (
          <Badge variant={phase === 'playoff' ? 'secondary' : 'outline'} className="px-1.5 py-0 text-[10px]">
            {phase === 'playoff' ? 'Playoffs' : 'Consol.'}
          </Badge>
        )}
      </span>
      {score(1)}
    </li>
  );
}

/** A notable game, told as its figure and the meeting it came from. */
function NotableGame({ label, value, game }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-[28px] font-semibold leading-none tracking-[-0.01em] tabular">{value}</p>
      {game && (
        <p className="mt-2 text-xs leading-snug text-muted-foreground tabular">
          {formatScore(game.team1Score)}–{formatScore(game.team2Score)} · Wk {game.week},{' '}
          <span className="font-medium text-foreground">{game.year}</span>
          {phaseOf(game) !== 'regular' && ` · ${PHASE_LABEL[phaseOf(game)]}`}
        </p>
      )}
    </div>
  );
}

/**
 * Two franchises' whole rivalry: the series, how each side fared by phase, the
 * games worth remembering, and every meeting, season by season. There is no
 * separate "recent meetings" list: the newest season leads the full one.
 *
 * The numbers are `summarizeMatchup`'s; this lays them out on the home page's
 * field, as one scoreboard that runs the length of the page. The franchise
 * names stick under the app header and every section keeps their columns —
 * franchise 1, the measure, franchise 2 — on a phone as on a desktop, which is
 * also why the page is held to one measure wide: at the full width of a
 * desktop the two columns are too far apart to compare.
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
  const played = matchups.filter((game) => Number.isFinite(game.team1Score) && Number.isFinite(game.team2Score));

  const recordRow = (label, a, b) => ({
    label,
    values: [formatRecord(a), formatRecord(b)],
    lead: leader(a.wins, b.wins),
    split: shares(a.wins, b.wins)
  });

  const figureRow = (label, a, b, format) => ({
    label,
    values: [format(a), format(b)],
    lead: leader(a, b),
    split: shares(a, b)
  });

  const recordTape = [
    recordRow('Series', first, second),
    recordRow('Regular season', first.byPhase.regular, second.byPhase.regular),
    summary.phases.playoff > 0 && recordRow('Playoffs', first.byPhase.playoff, second.byPhase.playoff),
    summary.phases.consolation > 0 && recordRow('Consolation', first.byPhase.consolation, second.byPhase.consolation),
    figureRow('Win %', first.winPct, second.winPct, formatPct)
  ].filter(Boolean);

  const scoringTape = [
    figureRow('Points for', first.points, second.points, formatScore),
    figureRow('Average score', first.averagePoints, second.averagePoints, formatScore),
    figureRow('Highest score', first.highScore?.value, second.highScore?.value, formatScore),
    {
      label: 'Biggest win',
      values: [first.biggestWin, second.biggestWin].map((win) => (win ? `+${formatScore(win.value)}` : '—')),
      lead: leader(first.biggestWin?.value ?? 0, second.biggestWin?.value ?? 0),
      split: shares(first.biggestWin?.value, second.biggestWin?.value)
    },
    {
      label: 'Longest win streak',
      values: [first.longestStreak, second.longestStreak].map((run) => (run ? String(run.length) : '—')),
      lead: leader(first.longestStreak?.length ?? 0, second.longestStreak?.length ?? 0),
      split: shares(first.longestStreak?.length, second.longestStreak?.length)
    }
  ];

  const streak = summary.currentStreak;
  const streakLine = streak
    ? streak.length === 1
      ? `${names[streak.side]} won the last meeting.`
      : `${names[streak.side]} has won the last ${streak.length} meetings.`
    : 'The last meeting was a tie.';

  const seriesLeader = leader(first.wins, second.wins);

  return (
    // No wrapper around the bar: a sticky element stays within its parent, and
    // it has to outlast everything below it, not just the scoreboard.
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">{back}</div>

      <NamesBar names={names} ids={ids} avatar={avatar} wins={[first.wins, second.wins]} ties={first.ties} />

      {/* The series: the page's one lit object. */}
      <section
        aria-label={`${names[0]} vs ${names[1]}`}
        className="relative overflow-hidden rounded-b-xl border border-t-0 border-border bg-card px-4 pb-4 pt-5 shadow-[0_1px_2px_rgb(0_0_0/0.4)] sm:px-6 sm:pb-5"
      >
        <FieldBackdrop left={avatar(0)} right={avatar(1)} />
        <div className="relative">
          <div className={cn(SIDES_GRID, 'gap-3')}>
            {[0, 1].map((i) => (
              <div key={ids[i]} className={cn('min-w-0', i === 0 ? 'order-1' : 'order-3 text-right')}>
                <span
                  className={cn(
                    'block font-display text-[56px] font-semibold leading-none tracking-[-0.01em] tabular lg:text-[72px]',
                    seriesLeader !== null && seriesLeader !== i && 'text-muted-foreground'
                  )}
                >
                  {summary.sides[i].wins}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground tabular">{formatPct(summary.sides[i].winPct)}</span>
              </div>
            ))}
            <span className="order-2 text-center text-[13px] font-medium text-muted-foreground">
              {first.ties > 0 ? `${first.ties} ${first.ties === 1 ? 'tie' : 'ties'}` : 'wins'}
            </span>
          </div>

          <ShareBar share={first.winPct} left={avatar(0)} right={avatar(1)} />

          <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[13px] text-muted-foreground">
            <span className="tabular">
              {summary.totalGames} {summary.totalGames === 1 ? 'meeting' : 'meetings'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              {streak && streak.length > 1 && <Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
              {streakLine}
            </span>
          </p>

          <div className="mt-3 flex justify-center">
            <ResultStrip games={played} avatar={avatar} names={names} />
          </div>
        </div>
      </section>

      <div className="mt-4 space-y-4">
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

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">Tale of the tape</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[recordTape, scoringTape].map((rows, index) => (
            <dl key={index} className={cn('divide-y divide-border/40', index > 0 && 'border-t border-border/60')}>
              {rows.map((row) => (
                <TapeRow key={row.label} {...row} avatar={avatar} />
              ))}
            </dl>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Every meeting</CardTitle>
          <CardDescription>By season, newest first.</CardDescription>
        </CardHeader>
        {/* A full-strength rule between seasons, where everything else on the
            page uses a faint one: the season is the unit this card is read in. */}
        <CardContent className="divide-y divide-foreground/15">
          {byYear.map(([year, games]) => (
            <section key={year} aria-labelledby={`meetings-${year}`} className="py-4 first:pt-0 last:pb-0">
              <h3
                id={`meetings-${year}`}
                className="mb-2 text-center font-display text-lg font-semibold leading-none tabular"
              >
                {year}
              </h3>
              <ol className="space-y-1">
                {games.map((game) => (
                  <MeetingRow key={game.id} game={game} avatar={avatar} />
                ))}
              </ol>
            </section>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default MatchupDetail;
