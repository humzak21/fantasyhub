import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { EmptyState } from '../ui/empty-state';
import { TeamAvatar } from '../ui/team-identity';
import {
  Trophy, TrendingUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMaskedTeamName, getMaskedUserName } from '../../utils/displayNameUtils';
import { buildPickEmStandings } from './pickEmStandings.js';
import { rankSeasonStandings, ordinal } from './seasonRanks.js';
import {
  SEASON_SCOPE_ID,
  STANDINGS_SCOPES,
  picksInScope,
  scopeIncludesWeek
} from './tourneys.js';
import TourneyNote from './TourneyNote.jsx';
import { TeamLink } from '../ui/team-link';
import { franchiseIdsByTeam } from '../../../utils/viewerTeam.js';

/**
 * Picks that have actually been played, and picks still waiting on a game.
 *
 * The data layer supplies `totalDecidedPicks`; the fallback is for a row from
 * before it did, where the two were the same number by assumption.
 */
const decidedPicks = (standing) => standing.totalDecidedPicks ?? standing.totalPicks ?? 0;
const pendingPicks = (standing) => Math.max(0, (standing.totalPicks ?? 0) - decidedPicks(standing));

const PickEmsSeasonStandings = ({
  season,
  currentWeek,
  seasonPicks = [],
  defaultScopeId = SEASON_SCOPE_ID,
  loading = false,
  resultsAvailable = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // Null until the member picks a tab, so the default can still arrive from the
  // week and the season's games without an effect copying it into state.
  const [chosenScopeId, setChosenScopeId] = useState(null);
  const scopeId = chosenScopeId ?? defaultScopeId;
  const scope = STANDINGS_SCOPES.find((candidate) => candidate.id === scopeId);
  const isSeason = scope.id === SEASON_SCOPE_ID;

  const franchiseIds = franchiseIdsByTeam(season?.teams);
  const formatAccuracy = (accuracy) => {
    return `${accuracy?.toFixed(1) || '0.0'}%`;
  };

  // Both cards below read these picks, so a tab changes the two together.
  const scopedPicks = useMemo(() => picksInScope(seasonPicks, scope), [seasonPicks, scope]);

  // Competition ranking on points, so everyone level at the top is level — see
  // `seasonRanks.js`.
  const ranked = useMemo(
    () => rankSeasonStandings(buildPickEmStandings(scopedPicks)),
    [scopedPicks]
  );

  // Calculate how often each team was picked in the weeks this view covers
  const calculateTeamPickFrequency = () => {
    const teamStats = {};

    scopedPicks.forEach(pick => {
      // Count picks for the picked team
      const pickedTeamId = pick.pickedTeamId;
      const pickedTeam = { id: pickedTeamId, name: pick.pickedTeamName };
      const pickedTeamName = getMaskedTeamName(pickedTeam, user, isAdmin);

      if (pickedTeamId && pickedTeamName) {
        if (!teamStats[pickedTeamId]) {
          teamStats[pickedTeamId] = {
            teamId: pickedTeamId,
            teamName: pickedTeamName,
            timesPicked: 0,
            timesCorrect: 0,
            totalMatchups: 0
          };
        }
        teamStats[pickedTeamId].timesPicked++;
        if (pick.isCorrect) {
          teamStats[pickedTeamId].timesCorrect++;
        }
      }

      // Count total matchups for both teams
      [pick.team1Id, pick.team2Id].forEach((teamId, idx) => {
        const originalTeamName = idx === 0 ? pick.team1Name : pick.team2Name;
        const team = { id: teamId, name: originalTeamName };
        const teamName = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
        if (teamId && teamName) {
          if (!teamStats[teamId]) {
            teamStats[teamId] = {
              teamId: teamId,
              teamName: teamName,
              timesPicked: 0,
              timesCorrect: 0,
              totalMatchups: 0
            };
          }
          teamStats[teamId].totalMatchups++;
        }
      });
    });

    // Convert to array and calculate percentages
    return Object.values(teamStats)
      .map(team => ({
        ...team,
        pickRate: team.totalMatchups > 0 ? (team.timesPicked / team.totalMatchups) * 100 : 0,
        winRate: team.timesPicked > 0 ? (team.timesCorrect / team.timesPicked) * 100 : 0
      }))
      .sort((a, b) => b.timesPicked - a.timesPicked);
  };

  const teamPickFrequency = calculateTeamPickFrequency();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading standings...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header. The two tourneys are stated here rather than in a sentence
          under the title: this is the table a member reads to work out whether
          they are in line for the FAAB, and the participation floor is the
          part of that answer the points column cannot give them. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Standings
          </CardTitle>
          <CardDescription>
            Pick'ems performance in each tourney and across the whole season
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TourneyNote currentWeek={currentWeek} />
        </CardContent>
      </Card>

      {/* One panel, redrawn for the tab: every view is the same two cards over
          fewer picks, so there is nothing to keep mounted per tab. */}
      <Tabs value={scope.id} onValueChange={setChosenScopeId}>
        <TabsList className="w-full">
          {STANDINGS_SCOPES.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={scope.id} className="mt-4 space-y-6">
          {/* The standings for this view */}
          {ranked.length === 0 ? (
            <Card>
              <EmptyState
                icon={Trophy}
                title={isSeason ? 'No season standings yet' : `No ${scope.span} standings yet`}
                description={
                  isSeason
                    ? "Season-long pick'em standings appear here as weeks are completed."
                    : `Standings for ${scope.span} appear here once those weeks are played.`
                }
              />
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{isSeason ? 'Season-Long Standings' : `${scope.label} Standings`}</CardTitle>
                <CardDescription>
                  {isSeason
                    ? 'Overall performance across all completed weeks'
                    : `Performance in ${scope.span} only`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* A view that ended before this week cannot be missing it. */}
                {!resultsAvailable && currentWeek && scopeIncludesWeek(scope, currentWeek) && (
                  <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <p className="text-sm text-warning">
                      <span className="font-medium">Note:</span> These standings do not include Week {currentWeek} results, as games are still in progress or results haven't been finalized yet.
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  {ranked.map((standing, index) => {
                    const name = getMaskedUserName(
                      standing.displayName,
                      standing.userId,
                      user,
                      isAdmin,
                      teamOwnerNames
                    );
                    const isViewer = Boolean(user) && standing.userId === user?.id;

                    return (
                      <div
                        key={standing.userId || index}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:p-4',
                          // Warm means yours.
                          isViewer && 'border-primary/40 bg-primary/[0.06]'
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {/* The trophy is the whole of the podium now. Second and
                              third wore ribbons of their own, which said the
                              league pays three places; it pays one, and everyone
                              level at the top shares it. */}
                          <span className="flex w-7 shrink-0 items-center justify-center sm:w-9">
                            {standing.isLeader ? (
                              <Trophy className="h-5 w-5 text-warning" aria-hidden="true" />
                            ) : (
                              <span className="text-sm font-semibold tabular text-muted-foreground">
                                {ordinal(standing.rank)}
                              </span>
                            )}
                          </span>

                          {/* The same mark the schedule and rankings use, keyed on
                              the name the viewer is shown — a masked reader's
                              avatar must follow the masked name, or the initials
                              give the owner away. */}
                          <TeamAvatar team={{ owner: name }} size="sm" />

                          <div className="min-w-0 flex-1">
                            {/* The name is a block of its own and the chip sits
                                after it, so the name ellipsises instead of the
                                chip being cut to "ti". */}
                            <div className="flex min-w-0 items-center gap-2 font-medium">
                              <span className="min-w-0 truncate">{name}</span>
                              {standing.isLeader && (
                                <Badge variant="warning" className="shrink-0">
                                  {standing.isTied ? `T-${ordinal(standing.rank)}` : ordinal(standing.rank)}
                                </Badge>
                              )}
                              {!standing.isLeader && standing.isTied && (
                                <span className="shrink-0 text-xs text-muted-foreground">tied</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                              {/* Decided picks, not picks entered. A week whose
                                  games have not kicked off yet is not seven
                                  misses — see `pendingPicks`. */}
                              <span className="tabular">
                                {standing.totalCorrectPicks}/{decidedPicks(standing)} picks
                              </span>
                              {pendingPicks(standing) > 0 && (
                                <span className="tabular">{pendingPicks(standing)} pending</span>
                              )}
                              <span>
                                  {standing.totalWeeksParticipated}{' '}
                                  {standing.totalWeeksParticipated === 1 ? 'week' : 'weeks'}
                                </span>
                              {/* On a phone the accuracy joins this line; from
                                  sm: it sits under the points on the right. */}
                              <span className="tabular sm:hidden">
                                {formatAccuracy(standing.overallAccuracyPercentage)}
                              </span>
                              {standing.perfectWeeks > 0 && (
                                <span className="flex items-center gap-1">
                                  <Trophy className="h-3 w-3" />
                                  {standing.perfectWeeks} perfect
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="font-semibold tabular">{standing.totalPoints} pts</div>
                          <div className="hidden text-sm tabular text-muted-foreground sm:block">
                            {formatAccuracy(standing.overallAccuracyPercentage)} overall
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Team Pick Frequency Table */}
          {teamPickFrequency.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Team Pick Popularity
                </CardTitle>
                <CardDescription>
                  How often each team was picked to win {isSeason ? 'across all matchups this season' : `in ${scope.span}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {teamPickFrequency.map((team, index) => (
                    <div
                      key={team.teamId}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular">
                        {index + 1}
                      </div>
                      <TeamAvatar team={{ name: team.teamName }} size="sm" />
                      {/* The name is the point of the row and gets whatever the
                          figures leave; the counts go under it in one short
                          line, where "61 picks in 83 matchups" no longer wraps
                          one word per line beside a three-letter name. */}
                      <div className="min-w-0 flex-1">
                        <TeamLink franchiseId={franchiseIds.get(team.teamId)} className="block truncate font-medium">
                          {team.teamName}
                        </TeamLink>
                        <div className="truncate text-xs tabular text-muted-foreground">
                          {team.timesPicked} of {team.totalMatchups} matchups
                        </div>
                      </div>

                      <div className="flex shrink-0 items-start gap-3 text-right sm:gap-6">
                        <div className="min-w-[3.25rem] sm:min-w-[4.5rem]">
                          <div className="font-semibold tabular">{team.pickRate.toFixed(1)}%</div>
                          <div className="text-[11px] text-muted-foreground">picked</div>
                        </div>
                        <div className="min-w-[3.25rem] sm:min-w-[4.5rem]">
                          {team.timesPicked > 0 ? (
                            <>
                              {/* A rate either side of even has a direction, so
                                  it carries colour; the raw counts beside it do
                                  not and stay in the foreground. */}
                              <div className={cn(
                                'font-semibold tabular',
                                team.winRate >= 50 ? 'text-success' : 'text-destructive'
                              )}>
                                {team.winRate.toFixed(1)}%
                              </div>
                              <div className="text-[11px] text-muted-foreground">won</div>
                            </>
                          ) : (
                            <div className="text-muted-foreground">&mdash;</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <Separator className="my-4" />
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold min-w-[80px]">Picked:</span>
                    <span>Percentage of times this team was picked to win out of their total matchups {isSeason ? 'this season' : `in ${scope.span}`}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold min-w-[80px]">Won:</span>
                    <span>Percentage of times this team actually won when picked by users {isSeason ? 'this season' : `in ${scope.span}`}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PickEmsSeasonStandings;
