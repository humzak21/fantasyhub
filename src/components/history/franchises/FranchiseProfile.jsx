import React, { useMemo, useRef, useState } from 'react';
import { Trophy, Award, Calendar, Crown, Medal, Activity, Target, Percent, TrendingUp } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { ChartContainer, useMobileAxis } from '../../ui/chart';
import { ResponsiveDataTable } from '../../ui/responsive-table';
import { SectionHeading } from '../../ui/section-heading';
import { Skeleton } from '../../ui/skeleton';
import { StatCard } from '../../ui/stat-card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { useFranchiseTransactions } from '../../../../hooks/queries/index.js';
import { getMaskedHistoricalTeamName } from '../utils/privacyHelpers';
import { formatWinPercentage, formatPoints, formatRecord, formatPlayoffFinish } from '../utils/statFormatters';
import { TRANSACTION_COLORS } from '../../../../types/index.js';
import { AXIS_STYLE } from '../utils/chartHelpers';
import RecordTrendChart from './RecordTrendChart';
import FranchiseWeekByWeek from './weeks/FranchiseWeekByWeek';

/**
 * The stats half of a franchise's profile: career figures, every season, the
 * week-by-week view, the record trend, its transactions, its rivalries and its
 * awards. `ProfilePage` owns the data and the head of the page.
 *
 * @param {React.ReactNode} props.rivalries - rendered between the charts and the awards
 */
const FranchiseProfile = ({
  franchise,
  franchiseId,
  franchiseData = null,
  loading = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  rivalries = null
}) => {
  const { data: transactionHistory = [] } = useFranchiseTransactions(franchiseId);
  const axis = useMobileAxis();

  // The week view's season list is the franchise's own season history, newest
  // first — so a season the sync writes next year appears here by existing.
  const weekSeasons = useMemo(
    () =>
      (franchiseData?.seasonHistory ?? [])
        .filter((row) => row.season?.id)
        .map((row) => ({ id: row.season.id, year: row.season.year, isCurrent: Boolean(row.is_current_season) }))
        .sort((a, b) => b.year - a.year),
    [franchiseData]
  );
  const [pickedSeasonId, setPickedSeasonId] = useState(null);
  // Switching franchise keeps the season when the new one played it too.
  const weekSeasonId = weekSeasons.some((s) => s.id === pickedSeasonId)
    ? pickedSeasonId
    : weekSeasons[0]?.id ?? null;
  const weekSectionRef = useRef(null);
  const openSeasonWeeks = (seasonId) => {
    setPickedSeasonId(seasonId);
    weekSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const viewer = useMemo(() => ({ user, isAdmin, teamOwnerNames }), [user, isAdmin, teamOwnerNames]);

  if (loading && !franchiseData) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // Career stats come from `v_franchise_career`, derived from the games. The
  // `franchise` fallbacks below are the denormalised columns on
  // `league_franchises`, which have not been recalculated since November 2025.
  const rawCareerStats = franchiseData?.careerStats || {};
  const careerStats = {
    total_wins: rawCareerStats.total_wins || franchise?.total_regular_season_wins || 0,
    total_losses: rawCareerStats.total_losses || franchise?.total_regular_season_losses || 0,
    avg_win_percentage: rawCareerStats.avg_win_percentage || franchise?.career_win_percentage || 0,
    playoff_appearances: rawCareerStats.playoff_appearances || franchise?.total_playoff_appearances || 0,
    // Map avg_points_per_game from materialized view to avg_points_for for display
    avg_points_for: rawCareerStats.avg_points_per_game ||
      (franchise?.total_points_for && (franchise?.total_regular_season_wins + franchise?.total_regular_season_losses) > 0
        ? franchise.total_points_for / (franchise.total_regular_season_wins + franchise.total_regular_season_losses)
        : 0),
    championships: rawCareerStats.championships || franchise?.total_championships || 0,
    runner_ups: rawCareerStats.runner_ups || 0,
    career_points_for: rawCareerStats.career_points_for || franchise?.total_points_for || 0,
    career_points_against: rawCareerStats.career_points_against || franchise?.total_points_against || 0
  };
  const seasonHistory = franchiseData?.seasonHistory || [];
  const awards = franchiseData?.awards || [];

  // Sorted once here rather than inside the render, so the column cells stay
  // pure functions of a row.
  const sortedSeasonHistory = [...seasonHistory].sort((a, b) => b.season.year - a.season.year);

  const finishOf = (season) => ({
    isChampion: season.playoff_finish === 'champion',
    isRunnerUp: season.playoff_finish === '2nd' || season.playoff_finish === 'runner-up',
    isThird: season.playoff_finish === '3rd' || season.playoff_finish === '3rd place',
  });

  const seasonRowClass = (season) => {
    const { isChampion, isRunnerUp, isThird } = finishOf(season);
    if (isChampion) return 'bg-warning/10';
    if (isRunnerUp) return 'bg-muted/60';
    if (isThird) return 'bg-warning/5';
    return '';
  };

  // Eight columns of small numbers. Below sm: these same definitions render one
  // card per season — year, team name and final placement identify the row, and
  // the point totals become a labelled grid.
  const seasonColumns = [
    {
      key: 'year',
      header: 'Year',
      priority: 'primary',
      headerClassName: 'w-20',
      className: 'font-semibold',
      cell: (season) => {
        const { isChampion, isRunnerUp, isThird } = finishOf(season);
        return (
          <div className="flex items-center gap-2 font-semibold">
            {isChampion && <Crown className="h-4 w-4 text-warning" />}
            {isRunnerUp && <Medal className="h-4 w-4 text-muted-foreground" />}
            {isThird && <Medal className="h-4 w-4 text-warning/70" />}
            {season.season.year}
          </div>
        );
      },
    },
    {
      key: 'team',
      header: 'Team Name',
      priority: 'primary',
      cell: (season) => (
        <p className="truncate text-sm">
          {getMaskedHistoricalTeamName(season, user, isAdmin, teamOwnerNames)}
        </p>
      ),
    },
    {
      key: 'finish',
      header: 'Finish',
      priority: 'primary',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (season) =>
        season.playoff_finish && season.playoff_finish !== 'missed' && season.playoff_finish !== 'none' ? (
          <Badge variant={finishOf(season).isChampion ? 'default' : 'secondary'}>
            {formatPlayoffFinish(season.playoff_finish)}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      key: 'record',
      header: 'Record',
      className: 'text-center tabular text-sm',
      headerClassName: 'text-center',
      cell: (season) =>
        formatRecord(season.regular_season_wins || 0, season.regular_season_losses || 0),
    },
    {
      key: 'winPct',
      header: 'Win %',
      className: 'text-center',
      headerClassName: 'text-center',
      cell: (season) => {
        const wins = season.regular_season_wins || 0;
        const losses = season.regular_season_losses || 0;
        const games = wins + losses;
        const winPct = games > 0 ? wins / games : 0;
        return (
          <span className={winPct >= 0.5 ? 'font-semibold text-success' : ''}>
            {formatWinPercentage(winPct)}
          </span>
        );
      },
    },
    {
      key: 'pf',
      header: 'PF',
      cardLabel: 'Points for',
      className: 'text-center tabular text-sm',
      headerClassName: 'text-center',
      cell: (season) => formatPoints(season.points_for || 0),
    },
    {
      key: 'pa',
      header: 'PA',
      cardLabel: 'Points against',
      className: 'text-center tabular text-sm',
      headerClassName: 'text-center',
      cell: (season) => formatPoints(season.points_against || 0),
    },
    {
      key: 'diff',
      header: 'Diff',
      className: 'text-center tabular text-sm',
      headerClassName: 'text-center',
      cell: (season) => {
        const diff = (season.points_for || 0) - (season.points_against || 0);
        return (
          <span className={diff >= 0 ? 'text-success' : 'text-destructive'}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-8">
      {/* Career stats */}
      <section className="space-y-4" aria-labelledby="career-heading">
        <SectionHeading id="career-heading" icon={TrendingUp}>
          Career
        </SectionHeading>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Career record"
            icon={Trophy}
            value={formatRecord(careerStats.total_wins, careerStats.total_losses)}
            footer={formatWinPercentage(careerStats.avg_win_percentage)}
          />
          <StatCard
            label="Avg points for"
            icon={Percent}
            value={careerStats.avg_points_for ? formatPoints(careerStats.avg_points_for) : '—'}
          />
          <StatCard label="Playoff appearances" icon={Target} value={careerStats.playoff_appearances || 0} />
          <StatCard label="Awards" icon={Award} value={awards.length} />
        </div>
      </section>

      {/* Season-by-season history */}
      <section className="space-y-4" aria-labelledby="seasons-heading">
        <SectionHeading id="seasons-heading" icon={Calendar}>
          Season by season
        </SectionHeading>
        {seasonHistory.length > 0 ? (
          <>
            <div className="rounded-xl border border-border p-2 sm:p-0 sm:overflow-hidden">
              <ResponsiveDataTable
                columns={seasonColumns}
                data={sortedSeasonHistory}
                rowClassName={(season) => seasonRowClass(season)}
                onRowClick={(season) => season.season?.id && openSeasonWeeks(season.season.id)}
              />
            </div>
            <p className="text-xs text-muted-foreground">Select a season to open it week by week.</p>
          </>
        ) : (
          <p className="py-8 text-center text-muted-foreground">No season history available</p>
        )}
      </section>

      <FranchiseWeekByWeek
        ref={weekSectionRef}
        franchiseId={franchiseId}
        seasons={weekSeasons}
        seasonId={weekSeasonId}
        onSeasonChange={setPickedSeasonId}
        viewer={viewer}
      />

      {/* Keyed on the franchise so another profile starts from its own team. */}
      <RecordTrendChart
        key={franchiseId}
        franchiseId={franchiseId}
        user={user}
        isAdmin={isAdmin}
        teamOwnerNames={teamOwnerNames}
      />

      {/* Transaction Activity Chart */}
      {transactionHistory.length > 0 && (
        <section className="space-y-4" aria-labelledby="transactions-heading">
          <SectionHeading id="transactions-heading" icon={Activity}>
            Transactions by season
          </SectionHeading>
          <div className="rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] sm:p-5">
            <ChartContainer config={{}} className="h-[260px] sm:h-[300px]">
              <BarChart
                data={transactionHistory.map(t => ({
                  year: t.year,
                  freeAgents: t.free_agent_adds || 0,
                  waivers: t.waiver_claims || 0,
                  trades: t.trades || 0,
                  drops: t.drops || 0,
                  total: t.total_transactions || 0
                }))}
                margin={{ top: 20, right: 12, left: 0, bottom: 5 }}
                {...axis.chart}
              >
                <XAxis dataKey="year" style={AXIS_STYLE} {...axis.x} />
                <YAxis style={AXIS_STYLE} allowDecimals={false} width={30} {...axis.y} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold mb-2 text-foreground">{label} Season</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Free Agents:</span>
                            <span className="font-medium text-foreground">{data.freeAgents}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Waivers:</span>
                            <span className="font-medium text-foreground">{data.waivers}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Trades:</span>
                            <span className="font-medium text-foreground">{data.trades}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Drops:</span>
                            <span className="font-medium text-foreground">{data.drops}</span>
                          </div>
                          <div className="flex justify-between gap-4 pt-1 border-t border-border">
                            <span className="font-medium text-foreground">Total:</span>
                            <span className="font-bold text-foreground">{data.total}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="rect"
                />
                <Bar
                  dataKey="freeAgents"
                  stackId="a"
                  fill={TRANSACTION_COLORS.free_agent}
                  name="Free Agents"
                />
                <Bar
                  dataKey="waivers"
                  stackId="a"
                  fill={TRANSACTION_COLORS.waiver}
                  name="Waivers"
                />
                <Bar
                  dataKey="trades"
                  stackId="a"
                  fill={TRANSACTION_COLORS.trade}
                  name="Trades"
                />
                <Bar
                  dataKey="drops"
                  stackId="a"
                  fill={TRANSACTION_COLORS.drop}
                  name="Drops"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </section>
      )}

      {rivalries}

      {/* League-voted awards only; this franchise's stat records are in the
          trophy case above and the record book. */}
      {awards.length > 0 && (
        <section className="space-y-4" aria-labelledby="awards-heading">
          <SectionHeading id="awards-heading" icon={Award}>
            League awards
          </SectionHeading>
          <ul className="grid gap-3 md:grid-cols-2">
            {awards.map((award, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{award.award_name}</p>
                  <p className="text-sm text-muted-foreground">{award.season?.year}</p>
                </div>
                <Badge variant="outline">Voted</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default FranchiseProfile;
