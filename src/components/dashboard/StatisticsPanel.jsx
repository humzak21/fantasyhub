import React, { useMemo, useState } from 'react';
import { TrendingUp, Target, Zap, Award, BarChart3, Shield } from 'lucide-react';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import {
  calculateWeeklyScoringTrends,
  calculateMarginOfVictory,
  calculateAllPlayRecords,
  calculatePointsPerGame
} from '../../utils/chartCalculations';
import WeeklyScoringTrendsChart from '../statistics/charts/WeeklyScoringTrendsChart';
import MarginOfVictoryChart from '../statistics/charts/MarginOfVictoryChart';
import AllPlayRecordsChart from '../statistics/charts/AllPlayRecordsChart';
import PointsPerGameChart from '../statistics/charts/PointsPerGameChart';
import FloatingTeamFilter from '../ui/FloatingTeamFilter';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import PageHeader from '../layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { StatCard } from '../ui/stat-card';
import { EmptyState } from '../ui/empty-state';
import { TeamIdentity } from '../ui/team-identity';
import { NumberText } from '../ui/number-text';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';

const StatisticsPanel = ({ rankings = [], currentWeek = 1, season = null }) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  // State management for chart filtering
  const [selectedTeams, setSelectedTeams] = useState([]);

  // `null` means "the whole season so far", and it is the default.
  //
  // This was `useState(currentWeek)`, which reads the prop once — on the first
  // render, before the season has loaded, when `currentWeek` is still its
  // default of 1. The range therefore stayed pinned at weeks 1 to 1 no matter
  // what week the league was on, and every chart plotted a single week.
  // Deriving the bound instead of seeding state from a prop means it follows
  // the season until the reader chooses otherwise, with no effect syncing the
  // two.
  const [weekRange, setWeekRange] = useState(null);
  const minWeek = weekRange?.min ?? 1;
  const maxWeek = Math.min(weekRange?.max ?? currentWeek, currentWeek);
  const setMinWeek = (week) => setWeekRange({ min: week, max: maxWeek });
  const setMaxWeek = (week) => setWeekRange({ min: minWeek, max: week });

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!season || !rankings.length) return {};

    return {
      weeklyScoringTrends: calculateWeeklyScoringTrends(rankings, season.schedule || []),
      marginOfVictory: calculateMarginOfVictory(rankings, season.schedule || []),
      allPlayRecords: calculateAllPlayRecords(rankings, season.schedule || []),
      pointsPerGame: calculatePointsPerGame(rankings, season.schedule || [], minWeek, maxWeek)
    };
  }, [rankings, season, minWeek, maxWeek]);

  // Handle team selection toggle
  const toggleTeamSelection = (teamId) => {
    setSelectedTeams(prev =>
      prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    );
  };

  // Handle select all/deselect all
  const toggleAllTeams = () => {
    if (selectedTeams.length === rankings.length) {
      setSelectedTeams([]);
    } else {
      setSelectedTeams(rankings.map(r => r.id));
    }
  };

  if (!rankings || !Array.isArray(rankings) || rankings.length === 0 || !season) {
    return (
      <>
        <PageHeader
          icon={BarChart3}
          title="League Analytics"
          description="Scoring, defence and luck across the season."
        />
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Nothing to analyse yet"
            description="Analytics appear once the league has teams and at least one completed game."
          />
        </Card>
      </>
    );
  }

  // Filter out teams with no games played for more accurate statistics
  const activeRankings = rankings.filter(team => team.gamesPlayed > 0);
  const hasActiveTeams = activeRankings.length > 0;

  // Calculate league-wide statistics using active teams only
  const leagueStats = {
    totalGames: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.gamesPlayed || 0), 0) / 2 : 0, // Divide by 2 since each game involves 2 teams
    averageWinPercentage: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.winPercentage || 0), 0) / activeRankings.length : 0,
    averagePointsFor: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.averagePointsFor || 0), 0) / activeRankings.length : 0,
    averagePointsAgainst: hasActiveTeams ? activeRankings.reduce((sum, team) => sum + (team.averagePointsAgainst || 0), 0) / activeRankings.length : 0,
    totalPoints: activeRankings.reduce((sum, team) => sum + (team.pointsFor || 0), 0),
    powerRatingRange: activeRankings.length > 0 ? (activeRankings[0]?.powerRating || 0) - (activeRankings[activeRankings.length - 1]?.powerRating || 0) : 0
  };

  // Find notable teams/records (use active teams only)
  const workingRankings = hasActiveTeams ? activeRankings : rankings;
  
  const highestScoringTeam = workingRankings.length > 0 ? workingRankings.reduce((highest, team) => 
    (team.averagePointsFor || 0) > (highest.averagePointsFor || 0) ? team : highest, workingRankings[0]
  ) : null;

  const lowestScoringTeam = workingRankings.length > 0 ? workingRankings.reduce((lowest, team) => 
    (team.averagePointsFor || 0) < (lowest.averagePointsFor || 0) ? team : lowest, workingRankings[0]
  ) : null;

  const bestDefense = workingRankings.length > 0 ? workingRankings.reduce((best, team) => 
    (team.averagePointsAgainst || 0) < (best.averagePointsAgainst || 0) ? team : best, workingRankings[0]
  ) : null;

  const worstDefense = workingRankings.length > 0 ? workingRankings.reduce((worst, team) => 
    (team.averagePointsAgainst || 0) > (worst.averagePointsAgainst || 0) ? team : worst, workingRankings[0]
  ) : null;

  const mostBlowouts = workingRankings.length > 0 ? workingRankings.reduce((most, team) => 
    (team.blowoutWins || 0) > (most.blowoutWins || 0) ? team : most, workingRankings[0]
  ) : null;

  const luckiestTeam = workingRankings.length > 0 ? workingRankings.reduce((luckiest, team) => {
    const teamLuck = (team.winPercentage || 0) - ((team.powerRating || 0) / 100);
    const luckiestLuck = (luckiest.winPercentage || 0) - ((luckiest.powerRating || 0) / 100);
    return teamLuck > luckiestLuck ? team : luckiest;
  }, workingRankings[0]) : null;

  const unluckiestTeam = workingRankings.length > 0 ? workingRankings.reduce((unluckiest, team) => {
    const teamLuck = (team.winPercentage || 0) - ((team.powerRating || 0) / 100);
    const unluckiestLuck = (unluckiest.winPercentage || 0) - ((unluckiest.powerRating || 0) / 100);
    return teamLuck < unluckiestLuck ? team : unluckiest;
  }, workingRankings[0]) : null;

  /**
   * A team singled out for something, with the figure that singled it out.
   *
   * The version this replaces built its classes by interpolation —
   * `bg-${color}-50`, `text-${color}-600` — which Tailwind's scanner cannot
   * see, so not one of them was ever generated. They appeared styled only
   * because a dark-mode remap block in globals.css happens to define those
   * exact selectors, and the default `color="gray"` fell outside its hue list
   * and rendered as an unstyled box.
   *
   * The accent is a token from a fixed set now, and the team is rendered with
   * the same identity chip the tables use, so the colour of the mark matches
   * the team's series in the charts below.
   */
  const TeamHighlight = ({ title, team, value, unit, description, accent = 'neutral' }) => {
    if (!team) {
      return (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
          <div className="mt-3 text-sm text-muted-foreground">No completed games yet.</div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)] sm:p-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
        <div className="mt-3">
          <TeamIdentity
            team={{
              ...team,
              name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
              ownerName: getMaskedOwnerName(team, user, isAdmin, teamOwnerNames),
            }}
            size="sm"
            showOwner
          />
        </div>
        {/* The figure is neutral. "Highest scoring" is already the claim;
            painting the number green says the team is *good*, which is an
            opinion the data does not carry — and it spends the success colour
            so that it means nothing where it genuinely applies. */}
        <div className="mt-3.5 flex items-baseline gap-1.5">
          <span className="font-display text-[26px] font-semibold leading-none tracking-[-0.01em] text-foreground">
            {value}
          </span>
          {unit && <span className="text-[12px] text-muted-foreground">{unit}</span>}
        </div>
        {description && <div className="mt-1.5 text-[12px] text-muted-foreground">{description}</div>}
      </div>
    );
  };

  /** A titled block of related cards. */
  const Section = ({ icon: Icon, title, children }) => (
    <section className="space-y-3.5">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );


  const weekOptions = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="League Analytics"
        description={`Scoring, defence and luck through week ${currentWeek}.`}
      />

      <div className="space-y-10">
        <Section icon={BarChart3} title="League overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Games played"
              value={Math.floor(leagueStats.totalGames)}
              icon={Target}
              accent="info"
              footer="Completed this season"
            />
            <StatCard
              label="League PPG"
              value={leagueStats.averagePointsFor}
              format="points"
              icon={Zap}
              accent="primary"
              footer="Average score per team per game"
            />
            <StatCard
              label="Power range"
              value={Math.abs(leagueStats.powerRatingRange)}
              format="points"
              icon={Award}
              accent="neutral"
              footer="Rating gap, first to last"
            />
          </div>
        </Section>

        <Section icon={Zap} title="Scoring">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TeamHighlight
              title="Highest scoring"
              team={highestScoringTeam}
              value={<NumberText value={highestScoringTeam?.averagePointsFor} />}
              unit="points per game"
              description={`${(highestScoringTeam?.pointsFor || 0).toFixed(1)} points in ${highestScoringTeam?.gamesPlayed || 0} games`}
              accent="success"
            />
            <TeamHighlight
              title="Lowest scoring"
              team={lowestScoringTeam}
              value={<NumberText value={lowestScoringTeam?.averagePointsFor} />}
              unit="points per game"
              description={`${(lowestScoringTeam?.pointsFor || 0).toFixed(1)} points in ${lowestScoringTeam?.gamesPlayed || 0} games`}
              accent="destructive"
            />
          </div>
        </Section>

        <Section icon={Shield} title="Points allowed">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TeamHighlight
              title="Fewest allowed"
              team={bestDefense}
              value={<NumberText value={bestDefense?.averagePointsAgainst} />}
              unit="allowed per game"
              description={`${(bestDefense?.pointsAgainst || 0).toFixed(1)} allowed all season`}
              accent="success"
            />
            <TeamHighlight
              title="Most allowed"
              team={worstDefense}
              value={<NumberText value={worstDefense?.averagePointsAgainst} />}
              unit="allowed per game"
              description={`${(worstDefense?.pointsAgainst || 0).toFixed(1)} allowed all season`}
              accent="destructive"
            />
          </div>
        </Section>

        <Section icon={TrendingUp} title="Performance">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TeamHighlight
              title="Most dominant"
              team={mostBlowouts}
              value={mostBlowouts?.blowoutWins || 0}
              unit="blowout wins"
              description="Wins by 30 points or more"
              accent="primary"
            />
            <TeamHighlight
              title="Luckiest"
              team={luckiestTeam}
              value={<NumberText value={(luckiestTeam?.winPercentage || 0) * 100} variant="percent" />}
              unit="win rate"
              description="Winning more than the rating predicts"
              accent="success"
            />
            <TeamHighlight
              title="Unluckiest"
              team={unluckiestTeam}
              value={<NumberText value={(unluckiestTeam?.winPercentage || 0) * 100} variant="percent" />}
              unit="win rate"
              description="Winning less than the rating predicts"
              accent="warning"
            />
          </div>
        </Section>

        <Section icon={BarChart3} title="Charts">
          {/* The week range sits above the charts it controls. It used to be
              two bare range inputs in a grey box, and the team filter that
              also controls these charts was rendered last in the document —
              four chart-heights below them on a phone. */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="min-week" className="mb-1.5 block text-xs text-muted-foreground">
                  From week
                </Label>
                <Select
                  value={String(minWeek)}
                  onValueChange={(v) => setMinWeek(Math.min(Number(v), maxWeek))}
                >
                  <SelectTrigger id="min-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((w) => (
                      <SelectItem key={w} value={String(w)}>
                        Week {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Label htmlFor="max-week" className="mb-1.5 block text-xs text-muted-foreground">
                  To week
                </Label>
                <Select
                  value={String(maxWeek)}
                  onValueChange={(v) => setMaxWeek(Math.max(Number(v), minWeek))}
                >
                  <SelectTrigger id="max-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((w) => (
                      <SelectItem key={w} value={String(w)}>
                        Week {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <FloatingTeamFilter
              rankings={rankings}
              selectedTeams={selectedTeams}
              onToggleTeam={toggleTeamSelection}
              onToggleAllTeams={toggleAllTeams}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Weekly scoring</CardTitle>
              </CardHeader>
              <CardContent>
                <WeeklyScoringTrendsChart
                  data={chartData.weeklyScoringTrends}
                  rankings={rankings}
                  selectedTeams={selectedTeams}
                  minWeek={minWeek}
                  maxWeek={maxWeek}
                  user={user}
                  isAdmin={isAdmin}
                  teamOwnerNames={teamOwnerNames}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Points per game</CardTitle>
              </CardHeader>
              <CardContent>
                <PointsPerGameChart
                  data={chartData.pointsPerGame}
                  selectedTeams={selectedTeams}
                  user={user}
                  isAdmin={isAdmin}
                  teamOwnerNames={teamOwnerNames}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average margin of victory</CardTitle>
              </CardHeader>
              <CardContent>
                <MarginOfVictoryChart
                  data={chartData.marginOfVictory}
                  selectedTeams={selectedTeams}
                  user={user}
                  isAdmin={isAdmin}
                  teamOwnerNames={teamOwnerNames}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All-play records</CardTitle>
              </CardHeader>
              <CardContent>
                <AllPlayRecordsChart
                  data={chartData.allPlayRecords}
                  selectedTeams={selectedTeams}
                  user={user}
                  isAdmin={isAdmin}
                  teamOwnerNames={teamOwnerNames}
                />
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default StatisticsPanel;
