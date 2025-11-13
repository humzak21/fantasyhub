import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Trophy, AlertTriangle, ChevronDown, ChevronUp, Target, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { getMaskedTeamName, getMaskedOwnerName, getMaskedDivisionName } from '../../utils/displayNameUtils';
import { ProjectionCalculator } from '../../../services/projectionCalculator.js';

const ProjectionsManager = ({
  season,
  teams = [],
  games = [],
  divisions = [],
  currentWeek,
  loading = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const [playoffProjections, setPlayoffProjections] = useState([]);
  const [lastPlaceProjections, setLastPlaceProjections] = useState([]);
  const [expandedPlayoffTeams, setExpandedPlayoffTeams] = useState(new Set());
  const [expandedLastPlaceTeams, setExpandedLastPlaceTeams] = useState(new Set());
  const [calculating, setCalculating] = useState(false);

  // Calculate projections when data changes
  useEffect(() => {
    if (!season || teams.length === 0 || games.length === 0) {
      setPlayoffProjections([]);
      setLastPlaceProjections([]);
      return;
    }

    setCalculating(true);
    try {
      const regularSeasonWeeks = season.regularSeasonWeeks || season.regular_season_weeks || 14;
      const calculator = new ProjectionCalculator(
        teams,
        games,
        divisions,
        currentWeek,
        regularSeasonWeeks
      );

      const playoff = calculator.calculatePlayoffProjections();
      const lastPlace = calculator.calculateLastPlaceProjections();

      setPlayoffProjections(playoff);
      setLastPlaceProjections(lastPlace);
    } catch (error) {
      console.error('Error calculating projections:', error);
      setPlayoffProjections([]);
      setLastPlaceProjections([]);
    } finally {
      setCalculating(false);
    }
  }, [season, teams, games, divisions, currentWeek]);

  // Toggle expanded state for playoff teams
  const togglePlayoffExpanded = (teamId) => {
    const newSet = new Set(expandedPlayoffTeams);
    if (newSet.has(teamId)) {
      newSet.delete(teamId);
    } else {
      newSet.add(teamId);
    }
    setExpandedPlayoffTeams(newSet);
  };

  // Toggle expanded state for last place teams
  const toggleLastPlaceExpanded = (teamId) => {
    const newSet = new Set(expandedLastPlaceTeams);
    if (newSet.has(teamId)) {
      newSet.delete(teamId);
    } else {
      newSet.add(teamId);
    }
    setExpandedLastPlaceTeams(newSet);
  };

  // Get difficulty badge color
  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Very Easy':
        return 'bg-green-100 text-green-800';
      case 'Easy':
        return 'bg-green-50 text-green-700';
      case 'Average':
        return 'bg-gray-100 text-gray-800';
      case 'Hard':
        return 'bg-orange-50 text-orange-700';
      case 'Very Hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  // Get division info for a team
  const getDivisionName = (divisionId) => {
    if (!divisionId || divisionId === 'unassigned') return 'Unassigned';
    const division = divisions.find(d => d.id === divisionId);
    return division?.name || 'Unknown';
  };

  // Get masked division name for a team's division
  const getMaskedDivisionNameForTeam = (divisionId) => {
    if (!divisionId || divisionId === 'unassigned') return 'Unassigned';
    const division = divisions.find(d => d.id === divisionId);
    const divisionIndex = divisions.findIndex(d => d.id === divisionId);

    if (!division || divisionIndex === -1) {
      // Fallback to generic division number if not found
      const fallbackIndex = divisions.length;
      // Check if user is admin or if their name matches a league member
      const isLeagueMember = user && teamOwnerNames && teamOwnerNames.includes(user.user_metadata?.full_name || user.user_metadata?.name || '');
      return (isAdmin || isLeagueMember) ? 'Unknown' : `Division ${fallbackIndex + 1}`;
    }

    return getMaskedDivisionName(division, divisionIndex, user, isAdmin, teamOwnerNames);
  };

  // Group playoff projections by division
  const groupedPlayoffProjections = useMemo(() => {
    const grouped = {};

    playoffProjections.forEach(projection => {
      const divisionId = projection.divisionId || 'unassigned';
      if (!grouped[divisionId]) {
        grouped[divisionId] = {
          divisionName: getDivisionName(divisionId),
          teams: []
        };
      }
      grouped[divisionId].teams.push(projection);
    });

    // Sort teams within each division by playoff odds (desc), then win% (desc)
    Object.values(grouped).forEach(division => {
      division.teams.sort((a, b) => {
        // First sort by playoff odds (higher odds first)
        const oddsA = a.playoffOdds || 0;
        const oddsB = b.playoffOdds || 0;
        if (oddsA !== oddsB) {
          return oddsB - oddsA;
        }

        // Then sort by win percentage (better record first)
        const winsA = a.wins || 0;
        const lossesA = a.losses || 0;
        const tiesA = a.ties || 0;
        const totalGamesA = winsA + lossesA + tiesA;
        const winPctA = totalGamesA > 0 ? winsA / totalGamesA : 0;

        const winsB = b.wins || 0;
        const lossesB = b.losses || 0;
        const tiesB = b.ties || 0;
        const totalGamesB = winsB + lossesB + tiesB;
        const winPctB = totalGamesB > 0 ? winsB / totalGamesB : 0;

        return winPctB - winPctA;
      });
    });

    // Sort divisions to show assigned divisions first
    return Object.entries(grouped).sort(([idA], [idB]) => {
      if (idA === 'unassigned') return 1;
      if (idB === 'unassigned') return -1;
      return 0;
    });
  }, [playoffProjections, divisions]);

  // Get opponent details for remaining games
  const getOpponentDetails = (game, teamId) => {
    const opponentId = game.team1Id === teamId ? game.team2Id : game.team1Id;
    const opponent = teams.find(t => t.id === opponentId);
    
    if (!opponent) {
      return {
        name: 'Unknown',
        record: '0-0',
        winPct: 0,
        ppg: 0
      };
    }
    
    const wins = opponent.wins || 0;
    const losses = opponent.losses || 0;
    const ties = opponent.ties || 0;
    const totalGames = wins + losses + ties;
    const winPct = totalGames > 0 ? wins / totalGames : 0;
    const points = opponent.pointsFor || opponent.points_for || 0;
    const ppg = totalGames > 0 ? points / totalGames : 0;
    
    return {
      name: getMaskedTeamName(opponent, user, isAdmin, teamOwnerNames),
      record: `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`,
      winPct,
      ppg,
      week: game.week
    };
  };

  // Check if season is active
  const isRegularSeason = currentWeek <= (season?.regularSeasonWeeks || season?.regular_season_weeks || 14);

  // No active season
  if (!season) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">No Active Season</h3>
              <p className="text-muted-foreground">
                Create or select a season to view playoff and last place projections.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Season is over
  if (!isRegularSeason) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
              <Trophy className="h-8 w-8 text-blue-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Playoffs Have Started</h3>
              <p className="text-muted-foreground">
                Regular season is complete. Playoff projections are no longer available.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Playoff Hunt Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-600" />
              <div>
                <CardTitle>The Hunt for Playoffs</CardTitle>
                <CardDescription>
                  Who's gonna make it to the dance?
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline">
              Week {currentWeek}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {calculating || loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-muted-foreground">Calculating projections...</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Render each division separately */}
              {groupedPlayoffProjections.map(([divisionId, divisionData], groupIndex) => {
                const divisionIndex = divisions.findIndex(d => d.id === divisionId);
                const division = divisions.find(d => d.id === divisionId);

                let maskedDivisionName;
                if (divisionId === 'unassigned') {
                  maskedDivisionName = 'Unassigned';
                } else if (division) {
                  maskedDivisionName = getMaskedDivisionName(division, divisionIndex >= 0 ? divisionIndex : groupIndex, user, isAdmin, teamOwnerNames);
                } else {
                  // Fallback if division not found but we have an index
                  // Check if user is admin or if their name matches a league member
                  const isLeagueMember = user && teamOwnerNames && teamOwnerNames.includes(user.user_metadata?.full_name || user.user_metadata?.name || '');
                  maskedDivisionName = (isAdmin || isLeagueMember) ? divisionData.divisionName : `Division ${groupIndex + 1}`;
                }

                return (
                <div key={divisionId} className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">

                    {maskedDivisionName}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-center">Record</TableHead>
                        <TableHead className="text-center">Playoff Odds</TableHead>
                        <TableHead className="text-center">Games to clinch</TableHead>
                        <TableHead className="text-center">Schedule</TableHead>
                        <TableHead className="text-center">Path</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {divisionData.teams.map((projection, index) => {
                        const isExpanded = expandedPlayoffTeams.has(projection.id);
                        const isClinched = projection.clinched;
                        const isEliminated = projection.eliminated;
                        
                        return (
                          <React.Fragment key={projection.id}>
                            <TableRow className={`
                              ${isClinched ? 'bg-green-50 dark:bg-green-900/20' : ''}
                              ${isEliminated ? 'bg-gray-50 dark:bg-gray-900/20 opacity-60' : ''}
                              ${isExpanded ? 'border-b-0' : ''}
                            `}>
                              <TableCell className="text-center font-medium text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {getMaskedTeamName(projection, user, isAdmin, teamOwnerNames)}
                                  {isClinched && (
                                    <Badge variant="default" className="text-xs bg-green-600">
                                      Clinched
                                    </Badge>
                                  )}
                                  {isEliminated && (
                                    <Badge variant="secondary" className="text-xs">
                                      Eliminated
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`font-medium ${
                                  (projection.wins || 0) > (projection.losses || 0) ? 'text-green-600' :
                                  (projection.wins || 0) < (projection.losses || 0) ? 'text-red-600' : 'text-gray-600'
                                }`}>
                                  {projection.wins || 0}-{projection.losses || 0}
                                  {projection.ties > 0 && `-${projection.ties}`}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                            <div className="space-y-1">
                              <div className={`font-mono font-bold text-base ${
                                (projection.playoffOdds || 0) >= 80 ? 'text-green-600' :
                                (projection.playoffOdds || 0) >= 50 ? 'text-blue-600' :
                                (projection.playoffOdds || 0) >= 20 ? 'text-orange-600' : 'text-red-600'
                              }`}>
                                {(projection.playoffOdds || 0).toFixed(0)}%
                              </div>
                              <div className="w-16 bg-muted rounded-full h-1.5 mx-auto">
                                <div 
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    (projection.playoffOdds || 0) >= 80 ? 'bg-green-600' :
                                    (projection.playoffOdds || 0) >= 50 ? 'bg-blue-600' :
                                    (projection.playoffOdds || 0) >= 20 ? 'bg-orange-600' : 'bg-red-600'
                                  }`}
                                  style={{ width: `${Math.min(100, projection.playoffOdds || 0)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {isClinched ? (
                              <span className="text-green-600 font-medium">✓</span>
                            ) : isEliminated ? (
                              <span className="text-gray-400">-</span>
                            ) : (
                              <span className="font-medium">{projection.magicNumber}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {projection.scheduleStrength?.difficulty ? (
                              <Badge className={getDifficultyColor(projection.scheduleStrength.difficulty)}>
                                {projection.scheduleStrength.difficulty}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => togglePlayoffExpanded(projection.id)}
                                  className="h-8"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                            
                            {isExpanded && (
                              <TableRow className="bg-muted/50">
                                <TableCell colSpan={7} className="p-4">
                                  <div className="space-y-4 text-sm">
                                    <div>
                                      <h4 className="font-semibold mb-2">Path to Playoffs</h4>
                                      <ul className="space-y-1 ml-4">
                                        <li className="text-muted-foreground">
                                          • {projection.path?.summary || 'No path information available'}
                                        </li>
                                      </ul>
                                    </div>
                                    
                                    {/* Remaining Schedule */}
                                    {projection.remainingGames && projection.remainingGames.length > 0 && (
                                      <div>
                                        <h4 className="font-semibold mb-2">Remaining Schedule ({projection.remainingGames.length} games)</h4>
                                        <div className="border rounded-lg overflow-hidden">
                                          <table className="w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-800">
                                              <tr>
                                                <th className="px-3 py-2 text-left font-medium">Week</th>
                                                <th className="px-3 py-2 text-left font-medium">Opponent</th>
                                                <th className="px-3 py-2 text-center font-medium">Record</th>
                                                <th className="px-3 py-2 text-center font-medium">Win %</th>
                                                <th className="px-3 py-2 text-center font-medium">PPG</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                              {projection.remainingGames.map((game, idx) => {
                                                const oppDetails = getOpponentDetails(game, projection.id);
                                                return (
                                                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="px-3 py-2">{oppDetails.week}</td>
                                                    <td className="px-3 py-2 font-medium">{oppDetails.name}</td>
                                                    <td className="px-3 py-2 text-center">{oppDetails.record}</td>
                                                    <td className="px-3 py-2 text-center">
                                                      <span className={oppDetails.winPct > 0.6 ? 'text-red-600 font-medium' : oppDetails.winPct < 0.4 ? 'text-green-600' : ''}>
                                                        {(oppDetails.winPct * 100).toFixed(1)}%
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">{oppDetails.ppg.toFixed(1)}</td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                        <p className="text-muted-foreground mt-2">
                                          {projection.scheduleStrength?.description}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Place Watch Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <div>
                <CardTitle>Punishment Watch</CardTitle>
                <CardDescription>
                  Who's boutta ride the metro?
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline">
              Week {currentWeek}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {calculating || loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-muted-foreground">Calculating projections...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center">Division</TableHead>
                    <TableHead className="text-center">Record</TableHead>
                    <TableHead className="text-center">Last Place Risk</TableHead>
                    <TableHead className="text-center">Games From Last</TableHead>
                    <TableHead className="text-center">Schedule</TableHead>
                    <TableHead className="text-center">Path</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...lastPlaceProjections]
                    .sort((a, b) => {
                      // First sort by last place odds (higher odds/risk first)
                      const oddsA = a.lastPlaceOdds || 0;
                      const oddsB = b.lastPlaceOdds || 0;
                      if (oddsA !== oddsB) {
                        return oddsB - oddsA;
                      }

                      // Then sort by win percentage (worse record first for last place)
                      const winsA = a.wins || 0;
                      const lossesA = a.losses || 0;
                      const tiesA = a.ties || 0;
                      const totalGamesA = winsA + lossesA + tiesA;
                      const winPctA = totalGamesA > 0 ? winsA / totalGamesA : 0;

                      const winsB = b.wins || 0;
                      const lossesB = b.losses || 0;
                      const tiesB = b.ties || 0;
                      const totalGamesB = winsB + lossesB + tiesB;
                      const winPctB = totalGamesB > 0 ? winsB / totalGamesB : 0;

                      return winPctA - winPctB; // Lower win% first for last place
                    })
                    .map((projection, index) => {
                    const isExpanded = expandedLastPlaceTeams.has(projection.id);
                    const highRisk = projection.lastPlaceOdds >= 50;
                    const mediumRisk = projection.lastPlaceOdds >= 20 && projection.lastPlaceOdds < 50;
                    
                    return (
                      <React.Fragment key={projection.id}>
                        <TableRow className={`
                          ${highRisk ? 'bg-red-50 dark:bg-red-900/20' : ''}
                          ${mediumRisk ? 'bg-orange-50 dark:bg-orange-900/20' : ''}
                          ${isExpanded ? 'border-b-0' : ''}
                        `}>
                          <TableCell className="text-center font-medium text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {getMaskedTeamName(projection, user, isAdmin, teamOwnerNames)}
                              {highRisk && (
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {getMaskedDivisionNameForTeam(projection.divisionId)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-medium ${
                              (projection.wins || 0) > (projection.losses || 0) ? 'text-green-600' :
                              (projection.wins || 0) < (projection.losses || 0) ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {projection.wins || 0}-{projection.losses || 0}
                              {projection.ties > 0 && `-${projection.ties}`}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="space-y-1">
                              <div className={`font-mono font-bold text-base ${
                                (projection.lastPlaceOdds || 0) >= 50 ? 'text-red-600' :
                                (projection.lastPlaceOdds || 0) >= 20 ? 'text-orange-600' :
                                (projection.lastPlaceOdds || 0) >= 10 ? 'text-blue-600' : 'text-green-600'
                              }`}>
                                {(projection.lastPlaceOdds || 0).toFixed(0)}%
                              </div>
                              <div className="w-16 bg-muted rounded-full h-1.5 mx-auto">
                                <div 
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    (projection.lastPlaceOdds || 0) >= 50 ? 'bg-red-600' :
                                    (projection.lastPlaceOdds || 0) >= 20 ? 'bg-orange-600' :
                                    (projection.lastPlaceOdds || 0) >= 10 ? 'bg-blue-600' : 'bg-green-600'
                                  }`}
                                  style={{ width: `${Math.min(100, projection.lastPlaceOdds || 0)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-medium ${
                              projection.gamesFromLast > 0 ? 'text-green-600' :
                              projection.gamesFromLast < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {projection.gamesFromLast > 0 ? '+' : ''}{projection.gamesFromLast}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {projection.scheduleStrength?.difficulty ? (
                              <Badge className={getDifficultyColor(projection.scheduleStrength.difficulty)}>
                                {projection.scheduleStrength.difficulty}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleLastPlaceExpanded(projection.id)}
                              className="h-8"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                        
                        {isExpanded && (
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={8} className="p-4">
                              <div className="space-y-4 text-sm">
                                <div>
                                  <h4 className="font-semibold mb-2">Path Analysis</h4>
                                  <ul className="space-y-1 ml-4">
                                    <li className="text-muted-foreground">
                                      • {projection.path?.summary || 'No path information available'}
                                    </li>
                                  </ul>
                                </div>
                                
                                {/* Remaining Schedule */}
                                {projection.remainingGames && projection.remainingGames.length > 0 && (
                                  <div>
                                    <h4 className="font-semibold mb-2">Remaining Schedule ({projection.remainingGames.length} games)</h4>
                                    <div className="border rounded-lg overflow-hidden">
                                      <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-800">
                                          <tr>
                                            <th className="px-3 py-2 text-left font-medium">Week</th>
                                            <th className="px-3 py-2 text-left font-medium">Opponent</th>
                                            <th className="px-3 py-2 text-center font-medium">Record</th>
                                            <th className="px-3 py-2 text-center font-medium">Win %</th>
                                            <th className="px-3 py-2 text-center font-medium">PPG</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                          {projection.remainingGames.map((game, idx) => {
                                            const oppDetails = getOpponentDetails(game, projection.id);
                                            return (
                                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                <td className="px-3 py-2">{oppDetails.week}</td>
                                                <td className="px-3 py-2 font-medium">{oppDetails.name}</td>
                                                <td className="px-3 py-2 text-center">{oppDetails.record}</td>
                                                <td className="px-3 py-2 text-center">
                                                  <span className={oppDetails.winPct > 0.6 ? 'text-red-600 font-medium' : oppDetails.winPct < 0.4 ? 'text-green-600' : ''}>
                                                    {(oppDetails.winPct * 100).toFixed(1)}%
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 text-center">{oppDetails.ppg.toFixed(1)}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                    <p className="text-muted-foreground mt-2">
                                      {projection.scheduleStrength?.description}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                How Projections Work
              </p>
              <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                <li>• <strong>Playoff Odds:</strong> Based on current record, remaining schedule difficulty, and win momentum</li>
                <li>• <strong>Magic Number:</strong> Wins needed to clinch playoff spot (or avoid last place)</li>
                <li>• <strong>Schedule Strength:</strong> Average win% and scoring of remaining opponents</li>
                <li>• <strong>Path:</strong> Scenarios showing what needs to happen for playoffs/last place</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectionsManager;

