import { useMemo, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { EmptyState } from '../../ui/empty-state';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '../../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { TeamAvatar } from '../../ui/team-identity';
import { useNearViewport } from '../../../hooks/use-near-viewport';
import { useHistoryFranchises, useStatComparison } from '../../../../hooks/queries/index.js';
import {
  CATEGORIES,
  DEFAULT_STAT_ID,
  STATS,
  getStat,
  rankedValues,
  resolveView,
  scatterPoints,
  seasonSeries,
  weeklySeries
} from '../../../../utils/statComparison/index.js';
import TrendPicker from '../franchises/TrendPicker';
import { useFranchiseIdentity } from '../utils/useFranchiseIdentity';
import { RankedBarChart, StatScatterChart, TrendLineChart } from './ComparisonCharts';
import ValueList from './ValueList';

const NO_SECOND_STAT = 'none';

const STATS_BY_CATEGORY = CATEGORIES.map((category) => ({
  ...category,
  stats: STATS.filter((stat) => stat.category === category.id)
}));

/**
 * Any stat, any franchises, any seasons — at the foot of the History overview.
 *
 * The reader picks what to compare; `resolveView` picks the chart that
 * answers it: lines through a season's weeks, lines across seasons, ranked
 * bars for a total, or a scatter when a second stat is chosen. Every figure
 * comes from `utils/statComparison`, whose definitions are the record book's.
 */
const StatComparison = ({ user = null, isAdmin = false, teamOwnerNames = [] }) => {
  // Above every early return: a hook after one breaks on the render where the
  // data arrives.
  const containerRef = useRef(null);
  const isNear = useNearViewport(containerRef);
  const { data: facts, isLoading, isError } = useStatComparison({ enabled: isNear });
  const { data: franchises = [] } = useHistoryFranchises();
  const identity = useFranchiseIdentity(franchises, user, isAdmin, teamOwnerNames);

  const [statId, setStatId] = useState(DEFAULT_STAT_ID);
  const [statYId, setStatYId] = useState(NO_SECOND_STAT);
  /** `'all'` follows the franchise list; otherwise explicit ids. */
  const [teamPick, setTeamPick] = useState('all');
  /** `'all'` follows the season list; otherwise explicit years. */
  const [seasonPick, setSeasonPick] = useState('all');
  const [requestedView, setRequestedView] = useState(null);
  const [perSeason, setPerSeason] = useState(false);

  const stat = getStat(statId);
  const statY = statYId === NO_SECOND_STAT ? null : getStat(statYId);

  const allFranchiseIds = facts?.franchiseIds ?? [];
  const allYears = useMemo(() => (facts?.years ?? []).map((entry) => entry.year), [facts]);

  const teamIds = teamPick === 'all' ? allFranchiseIds : teamPick.filter((id) => allFranchiseIds.includes(id));
  const years = useMemo(() => {
    if (seasonPick === 'all') return allYears;
    const picked = seasonPick.filter((year) => allYears.includes(year));
    return picked.length > 0 ? picked : allYears.slice(-1);
  }, [seasonPick, allYears]);
  const allSeasons = years.length === allYears.length && allYears.length > 1;

  const resolved = resolveView({
    stat,
    statY,
    yearCount: years.length,
    allSeasons,
    requested: requestedView
  });
  const averaged = resolved.perSeasonToggle && perSeason;

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5" aria-hidden="true" />
        Compare stats
      </CardTitle>
      <CardDescription>Any stat, any teams, any seasons</CardDescription>
    </CardHeader>
  );

  if (!isNear || isLoading) {
    return (
      <Card ref={containerRef}>
        {header}
        <CardContent className="space-y-4">
          <div className="h-10 animate-pulse rounded-md bg-muted/40" />
          <div className="h-[260px] animate-pulse rounded-lg bg-muted/40 sm:h-[360px]" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card ref={containerRef}>
        {header}
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">The stat comparison could not be loaded.</p>
        </CardContent>
      </Card>
    );
  }

  if (!facts || allFranchiseIds.length === 0) {
    return (
      <Card ref={containerRef}>
        {header}
        <EmptyState icon={BarChart3} title="No games yet" description="There are no scored games to compare." />
      </Card>
    );
  }

  const inProgressYears = facts.years.filter((entry) => !entry.isCompleted).map((entry) => entry.year);
  const nameOf = identity.name;

  // --- pickers ---------------------------------------------------------------

  const teamOptions = allFranchiseIds
    .map((id) => ({ value: id, label: nameOf(id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((option) => ({ ...option, icon: <TeamAvatar team={identity.avatar(option.value)} size="xs" /> }));

  const toggleTeam = (id) => {
    const current = teamIds;
    const next = current.includes(id)
      ? (current.length > 1 ? current.filter((value) => value !== id) : current)
      : [...current, id];
    setTeamPick(next.length === allFranchiseIds.length ? 'all' : next);
  };
  const allTeams = teamIds.length === allFranchiseIds.length;

  const toggleYear = (value) => {
    const year = Number(value);
    const next = years.includes(year)
      ? (years.length > 1 ? years.filter((entry) => entry !== year) : years)
      : [...years, year].sort((a, b) => a - b);
    setSeasonPick(next.length === allYears.length ? 'all' : next);
  };

  const teamSummary = allTeams ? 'All teams' : teamIds.length === 1 ? nameOf(teamIds[0]) : `${teamIds.length} teams`;
  const seasonSummary = allSeasons
    ? 'All seasons'
    : years.length === 1
      ? String(years[0])
      : `${years.length} seasons`;

  // --- the chart -------------------------------------------------------------

  const valueOptions = { perSeason: averaged };
  const ranked = rankedValues(facts, stat, teamIds, years, valueOptions);

  let chartNode = null;
  let scatter = null;
  let listRows = ranked.rows;
  let missing = ranked.missing;

  if (resolved.chart === 'scatter') {
    scatter = scatterPoints(facts, stat, statY, teamIds, years, {
      mode: resolved.view === 'season' ? 'season' : 'total',
      perSeason: averaged
    });
    const plotted = new Set(scatter.points.map((point) => point.franchiseId));
    missing = teamIds.filter((id) => !plotted.has(id));
    listRows = null;
    if (scatter.points.length > 0) {
      chartNode = (
        <StatScatterChart
          points={scatter.points}
          average={scatter.average}
          statX={stat}
          statY={statY}
          averaged={averaged}
          nameOf={nameOf}
        />
      );
    }
  } else if (resolved.chart === 'line-week' || resolved.chart === 'line-season') {
    const byWeek = resolved.chart === 'line-week';
    const { rows, series } = byWeek
      ? weeklySeries(facts, stat, teamIds, years[0])
      : seasonSeries(facts, stat, teamIds, years);
    if (series.length > 0) {
      chartNode = (
        <TrendLineChart
          rows={rows}
          series={series}
          xKey={byWeek ? 'week' : 'year'}
          stat={stat}
          nameOf={nameOf}
          inProgressYears={inProgressYears}
        />
      );
    }
  } else if (ranked.rows.length > 0) {
    chartNode = <RankedBarChart rows={ranked.rows} stat={stat} averaged={averaged} nameOf={nameOf} />;
  }

  const listCaption = resolved.chart === 'line-week'
    ? `${years[0]} season total`
    : years.length === 1
      ? `${years[0]} season`
      : allSeasons
        ? 'All-time'
        : `${years[0]}–${years[years.length - 1]}, ${years.length} seasons`;
  const inProgressNote = years.some((year) => inProgressYears.includes(year));

  return (
    <Card ref={containerRef}>
      {header}
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <StatSelect
            label="Stat"
            value={statId}
            onChange={(id) => {
              setStatId(id);
              if (id === statYId) setStatYId(NO_SECOND_STAT);
            }}
          />
          <StatSelect
            label="Against"
            value={statYId}
            onChange={setStatYId}
            exclude={statId}
            allowNone
          />
          <TrendPicker
            label="Teams"
            summary={teamSummary}
            options={teamOptions}
            selected={teamIds}
            onToggle={toggleTeam}
            allOption={{
              label: 'All teams',
              checked: allTeams,
              onToggle: () => setTeamPick(allTeams ? teamOptions.slice(0, 1).map((option) => option.value) : 'all')
            }}
          />
          <TrendPicker
            label="Seasons"
            summary={seasonSummary}
            options={[...allYears].reverse().map((year) => ({
              value: String(year),
              label: inProgressYears.includes(year) ? `${year} (in progress)` : String(year)
            }))}
            selected={years.map(String)}
            onToggle={toggleYear}
            allOption={{
              label: 'All seasons',
              checked: allSeasons,
              onToggle: () => setSeasonPick(allSeasons ? allYears.slice(-1) : 'all')
            }}
          />
        </div>

        {(resolved.options.length > 1 || resolved.perSeasonToggle) && (
          <div className="flex flex-wrap items-center gap-2">
            {resolved.options.length > 1 && (
              <Tabs value={resolved.view} onValueChange={setRequestedView}>
                <TabsList aria-label="View">
                  {resolved.options.map((option) => (
                    <TabsTrigger key={option.id} value={option.id}>
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            {resolved.perSeasonToggle && (
              <Tabs value={perSeason ? 'perSeason' : 'total'} onValueChange={(value) => setPerSeason(value === 'perSeason')}>
                <TabsList aria-label="Scale">
                  <TabsTrigger value="total">Total</TabsTrigger>
                  <TabsTrigger value="perSeason">Per season</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{stat.label}.</span> {stat.description}
          {statY && (
            <>
              {' '}
              <span className="font-medium text-foreground">{statY.label}.</span> {statY.description}
            </>
          )}
        </p>

        {chartNode ?? (
          <EmptyState
            icon={BarChart3}
            title="Nothing to chart"
            description="None of the picked teams has a figure for this in the picked seasons."
          />
        )}

        <ValueList
          caption={listCaption}
          rows={listRows}
          scatter={scatter}
          stat={stat}
          statY={statY}
          averaged={averaged}
          missing={missing}
          identity={identity}
        />

        {inProgressNote && (
          <p className="text-xs text-muted-foreground">
            {inProgressYears.join(', ')} is in progress
            {resolved.chart === 'line-season' && ' (marked *)'}; postseason figures count completed seasons only.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

/** A stat picker, grouped by category. */
const StatSelect = ({ label, value, onChange, exclude = null, allowNone = false }) => {
  const id = `stat-compare-${label.toLowerCase()}`;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="w-14 shrink-0 text-sm text-muted-foreground lg:w-auto">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label} className="min-w-0 lg:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))]">
          {allowNone && (
            <>
              <SelectItem value={NO_SECOND_STAT}>Nothing (one stat)</SelectItem>
              <SelectSeparator />
            </>
          )}
          {STATS_BY_CATEGORY.map((category) => (
            <SelectGroup key={category.id}>
              <SelectLabel>{category.label}</SelectLabel>
              {category.stats
                .filter((stat) => stat.id !== exclude)
                .map((stat) => (
                  <SelectItem key={stat.id} value={stat.id}>
                    {stat.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default StatComparison;
