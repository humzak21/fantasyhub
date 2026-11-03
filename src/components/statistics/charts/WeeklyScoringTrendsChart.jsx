import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartContainer, useMobileAxis, teamChartColor } from '../../ui/chart';
import { cn } from '../../../lib/utils';
import { getMaskedOwnerName, getMaskedTeamName, shortOwnerName } from '../../../utils/displayNameUtils';
import { resolveViewerTeam } from '../../../../utils/viewerTeam.js';

const LEAGUE_KEY = '__league';
const LEAGUE_LABEL = 'League avg';
const LEAGUE_COLOR = 'var(--muted-foreground)';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-card p-3 rounded border border-border shadow-lg">
      <p className="font-semibold text-foreground mb-2 text-sm">Week {label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="text-sm">
          <span style={{ color: entry.color }} className="font-medium">{entry.name}:</span>
          <span className="ml-2 font-semibold text-foreground">{entry.value !== null && entry.value !== undefined ? entry.value.toFixed(1) : 'N/A'}</span>
        </div>
      ))}
    </div>
  );
};

/*
 * The sixteen-hex palette that used to live here is gone. Lines were coloured
 * by the team's *index in this chart's own array*, so a franchise was blue
 * here, green on the next panel, and something else again after a filter
 * changed the array's length — the reader could not follow one team across
 * the page. `teamChartColor()` derives the colour from the franchise, so it
 * matches the team's chip in every table and its slot in the bracket. (The
 * list also contained #14b8a6 twice, labelled "teal" and "emerald", so two
 * teams shared a colour outright.)
 */

/**
 * The legend is a row of chips that toggle their series, in place of
 * recharts' own, which at 375px was five lines of fourteen names nobody could
 * tell apart from the fourteen lines above them. A chip is a button, so it
 * states its own pressed state.
 */
const LegendChips = ({ series, active, onToggle }) => (
  <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Series shown">
    {series.map((item) => {
      const on = active.has(item.key);
      return (
        <button
          key={item.key}
          type="button"
          aria-pressed={on}
          title={item.name}
          onClick={() => onToggle(item.key)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors pointer-coarse:min-h-8',
            on
              ? 'border-border bg-muted/60 text-foreground'
              : 'border-border/60 text-muted-foreground opacity-60 hover:opacity-100'
          )}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color, opacity: on ? 1 : 0.5 }}
          />
          {item.label}
        </button>
      );
    })}
  </div>
);

/**
 * WeeklyScoringTrendsChart - Line chart showing team scores over time
 * Allows filtering by selected teams and week range
 *
 * On a phone the chart opens on the viewer's team and the league average,
 * with every other team a chip away; fourteen lines on a 340px plot read as
 * one tangle. On a desktop every team is drawn, as before. The page's own
 * Teams filter (`selectedTeams`) still decides which teams are offered at
 * all; the chips choose among those.
 */
const WeeklyScoringTrendsChart = ({
  data = [],
  rankings = [],
  selectedTeams = [],
  minWeek = 1,
  maxWeek = 17,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Small-screen axis overrides; empty object on desktop. Must be above
  // the early returns below — a hook after a conditional return is a
  // rules-of-hooks violation and breaks on the render where the data
  // arrives.
  const axis = useMobileAxis();

  // The teams on offer: the page's filter, or everyone.
  const teamIds = useMemo(
    () => (selectedTeams.length > 0 ? selectedTeams : rankings.map((r) => r.id)),
    [selectedTeams, rankings]
  );

  const chartData = useMemo(() => {
    if (!data.length) return [];

    // Filter by week range
    const filteredByWeek = data.filter(item => item.week >= minWeek && item.week <= maxWeek);

    if (filteredByWeek.length === 0) return [];

    const everyone = rankings.map((r) => r.id);

    // Transform data to include only the offered teams, plus the league's
    // average that week over every team with a score, whatever the filter.
    return filteredByWeek.map(weekData => {
      const transformed = { week: weekData.week };

      teamIds.forEach(teamId => {
        if (weekData[teamId] !== undefined && weekData[teamId] !== null) {
          transformed[teamId] = weekData[teamId];
        }
      });

      const scores = everyone
        .map((id) => weekData[id])
        .filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (scores.length > 0) {
        transformed[LEAGUE_KEY] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      }

      return transformed;
    });
  }, [data, rankings, teamIds, minWeek, maxWeek]);

  const series = useMemo(() => {
    const teams = teamIds
      .map((teamId) => rankings.find((r) => r.id === teamId))
      .filter(Boolean)
      .map((team) => ({
        key: team.id,
        name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
        label: shortOwnerName(getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)),
        color: teamChartColor(team),
        dashed: false
      }));
    return [{ key: LEAGUE_KEY, name: LEAGUE_LABEL, label: LEAGUE_LABEL, color: LEAGUE_COLOR, dashed: true }, ...teams];
  }, [teamIds, rankings, user, isAdmin, teamOwnerNames]);

  const viewerTeamId = useMemo(
    () => resolveViewerTeam(rankings, user, teamOwnerNames)?.id ?? null,
    [rankings, user, teamOwnerNames]
  );

  // What the chips start on. Recomputed when the offer, the width or the
  // viewer changes; the reader's own toggles stand until then.
  const offerKey = `${axis.isMobile ? 'm' : 'd'}:${viewerTeamId ?? ''}:${teamIds.join(',')}`;
  const [chips, setChips] = useState({ offerKey: null, active: null });
  let active = chips.active;
  if (chips.offerKey !== offerKey) {
    const onPhone = axis.isMobile && selectedTeams.length === 0;
    const mine = viewerTeamId && teamIds.includes(viewerTeamId) ? [viewerTeamId] : [];
    active = new Set(onPhone ? [LEAGUE_KEY, ...mine] : [LEAGUE_KEY, ...teamIds]);
    // A phone with nobody to show opens on the league alone; a desktop
    // shows everyone, as it always did, with the average drawn beneath.
    setChips({ offerKey, active });
  }

  const toggle = (key) =>
    setChips((was) => {
      const next = new Set(was.active);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { offerKey: was.offerKey, active: next };
    });

  if (chartData.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No scoring data available for the selected week range.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col mt-6">
      <ChartContainer config={{}} className="h-[260px] w-full sm:h-[360px]">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 35, bottom: 0 }} {...axis.chart}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis
            dataKey="week"
            label={{ value: 'Week', position: 'insideBottomRight', offset: -5 }}
            tick={{ fontSize: 10 }}
            {...axis.x}
          />
          <YAxis
            label={{ value: 'Points', angle: -90, position: 'insideLeft', offset: -5, dy: 5 }}
            tick={{ fontSize: 10 }}
            width={30}
            {...axis.y}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255, 255, 255, 0.3)' }} />

          {series
            .filter((item) => active?.has(item.key))
            .map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeDasharray={item.dashed ? '4 4' : undefined}
                strokeWidth={item.dashed ? 1.5 : 2}
                dot={item.dashed ? false : { r: 3 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                connectNulls={true}
              />
            ))}
        </LineChart>
      </ChartContainer>
      <LegendChips series={series} active={active ?? new Set()} onToggle={toggle} />
    </div>
  );
};

export default WeeklyScoringTrendsChart;
