import { useMemo, useRef, useState } from 'react';
import { Flag, Gauge, Skull, Sprout } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { ResponsiveDataTable } from '../../ui/responsive-table';
import { SectionHeading } from '../../ui/section-heading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Skeleton } from '../../ui/skeleton';
import { TeamAvatar } from '../../ui/team-identity';
import { TeamLink } from '../../ui/team-link';
import { cn } from '../../../lib/utils';
import { formatRecord } from '../../../utils/format';
import { useNearViewport } from '../../../hooks/use-near-viewport';
import { useHistoryFranchises, useSituations } from '../../../../hooks/queries/index.js';
import { SCORE_BANDS, START_LENGTHS } from '../../../../utils/recordBook/index.js';
import { useFranchiseIdentity } from '../../history/utils/useFranchiseIdentity';
import StartOutcomesChart, { OutcomeLegend } from './StartOutcomesChart';

const DEFAULT_START = 3;

/** The franchise behind a row, with its avatar, masked as every name here is. */
const Franchise = ({ id, identity }) => (
  <span className="flex min-w-0 items-center gap-2">
    <TeamAvatar team={identity.avatar(id)} size="xs" />
    <TeamLink franchiseId={id} className="truncate font-medium">{identity.name(id)}</TeamLink>
  </span>
);

const lockTiming = (lock) => {
  if (lock.weeksLeft > 0) return `Wk ${lock.week} · ${formatRecord(lock.record)}, ${lock.weeksLeft} to play`;
  return `Wk ${lock.week} · final week${lock.onPoints ? ', on points' : ''}`;
};

/** Who locked first and last each season, and when. */
function SeasonRaces({ races, identity }) {
  // The name and its timing are one cell: as two columns the timing has a third
  // of a phone's width and truncates to "Wk 13 · 1…".
  const cellFor = (lock) =>
    lock ? (
      <span className="flex min-w-0 flex-col gap-1">
        <Franchise id={lock.franchiseId} identity={identity} />
        <span className="tabular text-xs text-muted-foreground">{lockTiming(lock)}</span>
      </span>
    ) : (
      <span className="text-muted-foreground">Still open</span>
    );

  const columns = [
    { key: 'year', header: 'Season', priority: 'primary', headerClassName: 'w-20', className: 'tabular font-medium', cell: (race) => race.year },
    { key: 'oneSeed', header: '1 seed', cardClassName: 'col-span-full', cell: (race) => cellFor(race.oneSeed) },
    { key: 'punishment', header: 'Punishment', cardClassName: 'col-span-full', cell: (race) => cellFor(race.punishment) }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" aria-hidden="true" />
          The 1 seed and the punishment
        </CardTitle>
        <CardDescription>
          The week each was locked: no result left could change it. A level record is not a lock
          while games remain, because points for is the tiebreak.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveDataTable columns={columns} data={races} rowKey={(race) => race.seasonId} />
      </CardContent>
    </Card>
  );
}

/** How the seasons of each start ended, chart over table. */
function StartOutcomes({ starts, identity }) {
  const [games, setGames] = useState(DEFAULT_START);
  const groups = starts[games] ?? [];

  const finishCell = (team) => (
    <span className="flex min-w-0 flex-col">
      <span className="tabular text-sm">{formatRecord(team)}</span>
      <span className="truncate text-xs text-muted-foreground">
        {team.year} · {identity.name(team.franchiseId)}
      </span>
    </span>
  );

  const columns = [
    { key: 'start', header: 'Start', priority: 'primary', className: 'tabular font-medium', cell: (group) => group.key },
    { key: 'count', header: 'Teams', className: 'tabular', cell: (group) => group.count },
    {
      key: 'average',
      header: 'Average finish',
      className: 'tabular',
      cell: (group) => `${group.averageWins.toFixed(1)}–${group.averageLosses.toFixed(1)}`
    },
    { key: 'playoffs', header: 'Playoffs', className: 'tabular', cell: (group) => `${group.madePlayoffs} of ${group.count}` },
    { key: 'titles', header: 'Titles', className: 'tabular', cell: (group) => group.titles },
    { key: 'punished', header: 'Punished', className: 'tabular', cell: (group) => group.punished },
    { key: 'best', header: 'Best finish', cardClassName: 'col-span-full', cell: (group) => finishCell(group.best) },
    { key: 'worst', header: 'Worst finish', cardClassName: 'col-span-full', cell: (group) => finishCell(group.worst) }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Sprout className="h-5 w-5" aria-hidden="true" />
              How seasons ended, by start
            </CardTitle>
            <CardDescription>Every team-season in a completed season, by its record after its first games.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden="true">After</span>
            <Select value={String(games)} onValueChange={(value) => setGames(Number(value))}>
              <SelectTrigger aria-label="Length of the start" className="h-9 w-[4.5rem] tabular text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {START_LENGTHS.map((length) => (
                  <SelectItem key={length} value={String(length)}>
                    {length}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden="true">games</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <StartOutcomesChart groups={groups} />
        <OutcomeLegend />
        <ResponsiveDataTable columns={columns} data={groups} rowKey={(group) => group.key} />
      </CardContent>
    </Card>
  );
}

/** One season's punishee, a square per week, ringed where it was locked. */
function PunishmentPath({ race, identity }) {
  const lock = race.punishment;
  const final = lock.path.at(-1);

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <span className="tabular font-medium">{race.year}</span>
          <Franchise id={lock.franchiseId} identity={identity} />
        </span>
        <span className="tabular text-xs text-muted-foreground">
          {formatRecord(final)} · locked wk {lock.week}
        </span>
      </div>
      <ol className="flex flex-wrap gap-1" aria-label={`${race.year}, week by week`}>
        {lock.path.map((game) => (
          <li
            key={game.week}
            title={`Week ${game.week}: ${formatRecord(game)}, ${game.place ?? '—'} of the league`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold',
              game.result === 'W' && 'bg-success/15 text-success',
              game.result === 'L' && 'bg-destructive/15 text-destructive',
              game.result === 'T' && 'bg-muted text-muted-foreground',
              game.week === lock.week && 'ring-2 ring-foreground/70'
            )}
          >
            <span className="sr-only">Week {game.week}: </span>
            {game.result}
          </li>
        ))}
      </ol>
    </li>
  );
}

function PunishmentPaths({ races, identity }) {
  const decided = races.filter((race) => race.punishment);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Skull className="h-5 w-5" aria-hidden="true" />
          Path to punishment
        </CardTitle>
        <CardDescription>Each season&rsquo;s last-place team, week by week. The ring is the week it was locked.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {decided.map((race) => (
            <PunishmentPath key={race.seasonId} race={race} identity={identity} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** League-wide scores above and below the bands, a season to a row. */
function ScoreBands({ bands }) {
  const columns = [
    {
      key: 'year',
      header: 'Season',
      priority: 'primary',
      className: 'tabular font-medium',
      cell: (row) => (row.completed ? row.year : `${row.year} so far`)
    },
    ...SCORE_BANDS.map((band) => ({
      key: band.id,
      header: band.label,
      className: 'tabular',
      cell: (row) => row.counts[band.id]
    }))
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" aria-hidden="true" />
          Score bands
        </CardTitle>
        <CardDescription>
          Regular-season scores across the league. 130+ counts every 140+ too, and so on up.
          Compare stats and the Records tab have them by franchise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveDataTable columns={columns} data={bands} rowKey={(row) => row.year} />
      </CardContent>
    </Card>
  );
}

/**
 * How seasons were decided: league history, so it sits with Compare stats and
 * reads the record book's own query. `utils/recordBook/situations.js` holds every
 * rule; this lays the results out and masks the names.
 */
const LeagueSituations = ({ user = null, isAdmin = false, teamOwnerNames = [] }) => {
  const containerRef = useRef(null);
  const isNear = useNearViewport(containerRef);
  const { data, isLoading, isError } = useSituations({ enabled: isNear });
  const { data: franchises = [] } = useHistoryFranchises();
  const identity = useFranchiseIdentity(franchises, user, isAdmin, teamOwnerNames);
  const races = useMemo(() => data?.races ?? [], [data]);

  if (isError) return null;

  return (
    <section ref={containerRef} className="space-y-4" aria-labelledby="league-situations-heading">
      <SectionHeading id="league-situations-heading" icon={Flag}>
        How seasons were decided
      </SectionHeading>

      {!isNear || isLoading || !data ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : (
        <div className="space-y-4">
          <SeasonRaces races={races} identity={identity} />
          <StartOutcomes starts={data.starts} identity={identity} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PunishmentPaths races={races} identity={identity} />
            <ScoreBands bands={data.bands} />
          </div>
        </div>
      )}
    </section>
  );
};

export default LeagueSituations;
