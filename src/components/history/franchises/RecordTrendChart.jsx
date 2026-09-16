import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { ChartContainer, useMobileAxis } from '../../ui/chart';
import { EmptyState } from '../../ui/empty-state';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { formatRecord } from '../../../utils/format';
import { useHistoryFranchises, useRecordTrends } from '../../../../hooks/queries/index.js';
import { buildTrendChart, yearsPlayed } from '../../../../utils/recordTrend.js';
import { canViewFullData, getMaskedFranchiseName } from '../utils/privacyHelpers';
import { trendSeriesLabel, trendSeriesStyles } from './recordTrendStyle';
import TrendPicker from './TrendPicker';

const TOOLTIP_ROWS = 10;
/** Beyond this many lines, per-week dots turn the chart into confetti. */
const DOTTED_SERIES = 4;

const signed = (value) => (value > 0 ? `+${value}` : String(value));

/**
 * A franchise's record through the season, as games over .500 after each
 * regular-season week — with any other teams and seasons laid over it.
 *
 * Opens on the profile's franchise in its latest season. The reader picks
 * teams and seasons; the chart is every picked team in every picked season it
 * played. "All seasons" follows the team list, so adding a team adds its
 * seasons too.
 */
const RecordTrendChart = ({ franchiseId, user = null, isAdmin = false, teamOwnerNames = [] }) => {
  // Above every early return: a hook after one breaks on the render where the
  // data arrives.
  const axis = useMobileAxis();
  const { data: trends, isLoading, isError } = useRecordTrends();
  const { data: franchises = [] } = useHistoryFranchises();

  const [teamIds, setTeamIds] = useState([franchiseId]);
  /** `null` until touched (latest season), `'all'`, or explicit years. */
  const [seasonPick, setSeasonPick] = useState(null);

  const identity = useMemo(() => {
    const byId = new Map(franchises.map((franchise) => [franchise.id, franchise]));
    const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
    const name = (id) => getMaskedFranchiseName(byId.get(id) ?? { id }, user, isAdmin, teamOwnerNames);
    return {
      name,
      // Initials come from the owner, so a masked viewer's avatar is keyed on
      // the masked name; the colour still tells franchises apart.
      avatar: (id) => {
        const franchise = byId.get(id);
        return fullData && franchise
          ? { franchiseId: id, owner_name: franchise.owner_name }
          : { franchiseId: id, name: name(id) };
      }
    };
  }, [franchises, user, isAdmin, teamOwnerNames]);

  const available = useMemo(() => yearsPlayed(trends, teamIds), [trends, teamIds]);

  const years = useMemo(() => {
    if (seasonPick === 'all') return available;
    const picked = (seasonPick ?? []).filter((year) => available.includes(year));
    // Removing the only team that played a picked season leaves nothing to
    // draw; fall back to the latest season rather than an empty chart.
    return picked.length > 0 ? picked : available.slice(0, 1);
  }, [seasonPick, available]);

  const chart = useMemo(() => buildTrendChart(trends, teamIds, years), [trends, teamIds, years]);
  const styles = useMemo(() => trendSeriesStyles(chart.series, trends?.years ?? []), [chart.series, trends]);

  const seasonCount = new Set(chart.series.map((line) => line.year)).size;
  const labelOf = (line) =>
    trendSeriesLabel(line, { teamCount: teamIds.length, seasonCount, franchiseName: identity.name });

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" aria-hidden="true" />
        Record trend
      </CardTitle>
      <CardDescription>Games over .500 after each regular-season week</CardDescription>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card>
        {header}
        <CardContent>
          <div className="h-[260px] animate-pulse rounded-lg bg-muted/40 sm:h-[360px]" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        {header}
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            The record trend could not be loaded.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!trends?.byFranchise?.[franchiseId]) {
    return (
      <Card>
        {header}
        <EmptyState
          icon={TrendingUp}
          title="No games yet"
          description="This franchise has no scored regular-season games to chart."
        />
      </Card>
    );
  }

  const isInProgress = (year) => trends.years.some((entry) => entry.year === year && !entry.isCompleted);

  // The profile's team first, then everyone else with games, by name.
  const teamOptions = Object.keys(trends.byFranchise)
    .map((id) => ({ value: id, label: identity.name(id) }))
    .sort((a, b) =>
      a.value === franchiseId ? -1 : b.value === franchiseId ? 1 : a.label.localeCompare(b.label)
    )
    .map((option) => ({
      ...option,
      icon: <TeamAvatar team={identity.avatar(option.value)} size="xs" />
    }));

  const toggleTeam = (id) =>
    setTeamIds((current) => {
      if (!current.includes(id)) return [...current, id];
      return current.length > 1 ? current.filter((value) => value !== id) : current;
    });

  const toggleYear = (value) => {
    const year = Number(value);
    const next = years.includes(year)
      ? (years.length > 1 ? years.filter((entry) => entry !== year) : years)
      : [...years, year];
    setSeasonPick(next.length === available.length ? 'all' : next);
  };

  const allSeasons = seasonPick === 'all' || (available.length > 0 && years.length === available.length);

  const teamSummary = teamIds.length === 1 ? identity.name(teamIds[0]) : `${teamIds.length} teams`;
  const seasonSummary = allSeasons && available.length > 1
    ? 'All seasons'
    : years.length === 1
      ? String(years[0])
      : `${years.length} seasons`;

  const dotted = chart.series.length <= DOTTED_SERIES;
  const seriesByKey = new Map(chart.series.map((line) => [line.key, line]));

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <TrendPicker
            label="Teams"
            summary={teamSummary}
            options={teamOptions}
            selected={teamIds}
            onToggle={toggleTeam}
          />
          <TrendPicker
            label="Seasons"
            summary={seasonSummary}
            options={available.map((year) => ({
              value: String(year),
              label: isInProgress(year) ? `${year} (in progress)` : String(year)
            }))}
            selected={years.map(String)}
            onToggle={toggleYear}
            allOption={{
              label: 'All seasons',
              checked: allSeasons,
              onToggle: () => setSeasonPick(allSeasons ? available.slice(0, 1) : 'all')
            }}
          />
        </div>

        <ChartContainer config={{}} className="h-[260px] w-full sm:h-[360px]">
          <LineChart data={chart.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} {...axis.chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tickLine={false} tick={{ fontSize: 11 }} {...axis.x} />
            <YAxis
              allowDecimals={false}
              domain={chart.yDomain}
              tickFormatter={signed}
              tickLine={false}
              width={32}
              tick={{ fontSize: 11 }}
              {...axis.y}
            />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ stroke: 'var(--border)' }}
              content={<TrendTooltip seriesByKey={seriesByKey} styles={styles} labelOf={labelOf} />}
            />
            {chart.series.map((line) => {
              const style = styles.get(line.key);
              return (
                <Line
                  key={line.key}
                  type="linear"
                  dataKey={line.key}
                  name={labelOf(line)}
                  stroke={style.stroke}
                  strokeOpacity={style.strokeOpacity}
                  strokeWidth={2}
                  dot={dotted ? { r: 2.5, fill: style.stroke, strokeWidth: 0 } : false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ChartContainer>

        <ul aria-label="Lines" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {chart.series.map((line) => {
            const style = styles.get(line.key);
            return (
              <li key={line.key} className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: style.stroke, opacity: style.strokeOpacity }}
                />
                <span className="truncate text-foreground">{labelOf(line)}</span>
                <span className="shrink-0 tabular text-muted-foreground">
                  {formatRecord(line.final)}
                  {!line.isCompleted && ' (in progress)'}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

/**
 * Every line's record at the hovered week, best first. Hand-written because
 * `ChartTooltipContent` hides a value of 0, and .500 is exactly the value this
 * chart most needs to show.
 */
const TrendTooltip = ({ active, payload, label, seriesByKey, styles, labelOf }) => {
  if (!active || !payload?.length) return null;

  const rows = payload
    .map((entry) => {
      const line = seriesByKey.get(entry.dataKey);
      const point = line?.points.find((candidate) => candidate.week === label);
      return line && point ? { line, point } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.point.net - a.point.net || b.line.year - a.line.year);
  if (rows.length === 0) return null;

  const shown = rows.slice(0, TOOLTIP_ROWS);
  return (
    <div className="min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-foreground">Week {label}</p>
      <ul className="space-y-1">
        {shown.map(({ line, point }) => {
          const style = styles.get(line.key);
          return (
            <li key={line.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: style.stroke, opacity: style.strokeOpacity }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{labelOf(line)}</span>
              <span className="tabular font-medium text-foreground">{formatRecord(point)}</span>
              <span
                className={cn(
                  'w-3 text-center font-semibold',
                  point.result === 'W' ? 'text-success' : point.result === 'L' ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {point.result}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > shown.length && (
        <p className="mt-1.5 text-muted-foreground">+{rows.length - shown.length} more</p>
      )}
    </div>
  );
};

export default RecordTrendChart;
