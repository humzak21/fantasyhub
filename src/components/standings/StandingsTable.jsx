import React, { useState } from 'react';
import { Edit2, Settings, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const StandingsTable = ({
  teams = [],
  divisions = [],
  standings = { divisions: [], unassigned: [] },
  currentWeek,
  loading = false,
  isAuthenticated = false,
  onDivisionRename,
  onTeamDivisionChange,
  onCreateDivision,
  games = [], // Add games data for streak calculation fallback
  user = null,
  isAdmin = false
}) => {
  const [isManaging, setIsManaging] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');

  // Calculate standings data
  const calculateStandings = () => {
    // If we have pre-calculated standings from the database, use those
    if (standings && (standings.divisions?.length > 0 || standings.unassigned?.length > 0)) {
      // Merge the pre-calculated standings with division info
      const divisionStandings = divisions.map(division => {
        const standingDivision = standings.divisions.find(d => d.divisionId === division.id);
        return {
          ...division,
          teams: standingDivision?.teams || [],
          hasTeams: (standingDivision?.teams?.length || 0) > 0
        };
      });

      return {
        divisions: divisionStandings,
        unassigned: standings.unassigned || []
      };
    }

    // Fallback: calculate from teams data if no pre-calculated standings
    if (!teams || teams.length === 0) return { divisions: [], unassigned: [] };

    // Group teams by division - check multiple potential division field names
    const groupedTeams = teams.reduce((acc, team) => {
      const divisionId = team.divisionId || team.division_id || 'unassigned';
      if (!acc[divisionId]) {
        acc[divisionId] = [];
      }
      acc[divisionId].push(team);
      return acc;
    }, {});

    // Sort teams within each division by win percentage, then points for, then points against
    Object.keys(groupedTeams).forEach(divisionId => {
      groupedTeams[divisionId].sort((a, b) => {
        // First by win percentage (descending)
        const aWinPct = a.winPercentage || a.win_percentage || 0;
        const bWinPct = b.winPercentage || b.win_percentage || 0;
        if (aWinPct !== bWinPct) {
          return bWinPct - aWinPct;
        }

        // Then by points for (descending)
        const aPointsFor = a.pointsFor || a.points_for || 0;
        const bPointsFor = b.pointsFor || b.points_for || 0;
        if (aPointsFor !== bPointsFor) {
          return bPointsFor - aPointsFor;
        }

        // Finally by points against (ascending - lower is better)
        const aPointsAgainst = a.pointsAgainst || a.points_against || 0;
        const bPointsAgainst = b.pointsAgainst || b.points_against || 0;
        return aPointsAgainst - bPointsAgainst;
      });
    });

    // Create division standings with rank and playoff status
    const divisionStandings = divisions.map(division => {
      const divisionTeams = groupedTeams[division.id] || [];
      const teamsWithRank = divisionTeams.map((team, index) => ({
        ...team,
        // Normalize field names for consistent access
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
        pointsFor: parseFloat(team.pointsFor || team.points_for || 0),
        pointsAgainst: parseFloat(team.pointsAgainst || team.points_against || 0),
        pointDifferential: parseFloat(team.pointDifferential || team.point_differential || 0),
        winPercentage: parseFloat(team.winPercentage || team.win_percentage || 0),
        // Calculate win percentage if not provided
        calculatedWinPct: team.wins + team.losses + team.ties > 0
          ? team.wins / (team.wins + team.losses + team.ties)
          : 0,
        divisionRank: index + 1,
        isPlayoffSpot: index < 3, // Top 3 teams per division make playoffs
        currentStreak: (() => {
          const dbStreak = team.currentStreak || team.current_streak;
          if (dbStreak && dbStreak.type !== 'none' && dbStreak.length > 0) {
            return dbStreak;
          }
          // Fallback to calculate from games if database doesn't have it
          return calculateStreakFromGames(team.id || team.teamId, games);
        })()
      }));

      return {
        ...division,
        teams: teamsWithRank,
        hasTeams: teamsWithRank.length > 0
      };
    });

    // Handle unassigned teams
    const unassignedTeams = (groupedTeams.unassigned || []).map((team, index) => ({
      ...team,
      // Normalize field names for consistent access
      wins: team.wins || 0,
      losses: team.losses || 0,
      ties: team.ties || 0,
      pointsFor: parseFloat(team.pointsFor || team.points_for || 0),
      pointsAgainst: parseFloat(team.pointsAgainst || team.points_against || 0),
      pointDifferential: parseFloat(team.pointDifferential || team.point_differential || 0),
      winPercentage: parseFloat(team.winPercentage || team.win_percentage || 0),
      // Calculate win percentage if not provided
      calculatedWinPct: team.wins + team.losses + team.ties > 0
        ? team.wins / (team.wins + team.losses + team.ties)
        : 0,
      divisionRank: index + 1,
      isPlayoffSpot: false,
      currentStreak: (() => {
        const dbStreak = team.currentStreak || team.current_streak;
        if (dbStreak && dbStreak.type !== 'none' && dbStreak.length > 0) {
          return dbStreak;
        }
        // Fallback to calculate from games if database doesn't have it
        return calculateStreakFromGames(team.id || team.teamId, games);
      })()
    }));

    return {
      divisions: divisionStandings,
      unassigned: unassignedTeams
    };
  };

  const getStreakDisplay = (streak) => {
    if (!streak || streak.type === 'none') return '-';
    const prefix = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : 'T';
    return `${prefix}${streak.length}`;
  };

  const getStreakVariant = (streak) => {
    if (streak?.type === 'win') return 'default';
    if (streak?.type === 'loss') return 'destructive';
    return 'secondary';
  };

  // Fallback function to calculate streak from games data if not in database
  const calculateStreakFromGames = (teamId, gamesData) => {
    if (!gamesData || gamesData.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Streak Calc] No games data for team ${teamId}`);
      }
      return { type: 'none', length: 0 };
    }
    
    // Debug: log that we're calculating streaks from games
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Calculating streak for team ${teamId}`, { 
        gamesCount: gamesData.length,
        sampleGame: gamesData[0]
      });
    }

    // Filter completed games for this team and sort by week descending
    const teamGames = gamesData
      .filter(game => {
        const isTeamInGame = (
          game.team1Id === teamId || game.team2Id === teamId || 
          game.team1_id === teamId || game.team2_id === teamId
        );
        const isCompleted = game.isCompleted || game.is_completed || 
          (game.team1_score !== null && game.team1_score !== undefined && 
           game.team2_score !== null && game.team2_score !== undefined);
        
        return isTeamInGame && isCompleted;
      })
      .sort((a, b) => (b.week || 0) - (a.week || 0));

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Streak Calc] Team ${teamId} - Found ${teamGames.length} completed games`);
    }

    if (teamGames.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Streak Calc] No completed games found for team ${teamId}`);
      }
      return { type: 'none', length: 0 };
    }

    // Get the most recent game result
    const latestGame = teamGames[0];
    const isTeam1 = latestGame.team1Id === teamId || latestGame.team1_id === teamId;
    const team1Score = parseFloat(latestGame.team1_score || 0);
    const team2Score = parseFloat(latestGame.team2_score || 0);
    
    let latestResult;
    if (team1Score === team2Score) {
      latestResult = 'tie';
    } else if ((isTeam1 && team1Score > team2Score) || (!isTeam1 && team2Score > team1Score)) {
      latestResult = 'win';
    } else {
      latestResult = 'loss';
    }

    if (latestResult === 'tie') return { type: 'tie', length: 1 };

    // Count consecutive games with the same result
    let streakLength = 1;
    for (let i = 1; i < teamGames.length; i++) {
      const game = teamGames[i];
      const gameIsTeam1 = game.team1Id === teamId || game.team1_id === teamId;
      const gameTeam1Score = parseFloat(game.team1_score || 0);
      const gameTeam2Score = parseFloat(game.team2_score || 0);
      
      let gameResult;
      if (gameTeam1Score === gameTeam2Score) {
        gameResult = 'tie';
      } else if ((gameIsTeam1 && gameTeam1Score > gameTeam2Score) || (!gameIsTeam1 && gameTeam2Score > gameTeam1Score)) {
        gameResult = 'win';
      } else {
        gameResult = 'loss';
      }

      if (gameResult === latestResult) {
        streakLength++;
      } else {
        break;
      }
    }

    return { type: latestResult, length: streakLength };
  };

  const handleDivisionRename = async (divisionId, newName) => {
    if (onDivisionRename) {
      await onDivisionRename(divisionId, newName);
    }
    setNewDivisionName('');
  };

  const handleTeamMove = async (teamId, newDivisionId) => {
    if (onTeamDivisionChange) {
      await onTeamDivisionChange(teamId, newDivisionId);
    }
  };

  const handleCreateDivision = async (divisionName) => {
    if (onCreateDivision && divisionName.trim()) {
      await onCreateDivision(divisionName.trim(), divisions.length + 1);
    }
  };

  const { divisions: divisionStandings, unassigned } = calculateStandings();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Standings
              {currentWeek && (
                <Badge variant="outline">Week {currentWeek}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              League standings by division - Top 3 from each division make playoffs
            </CardDescription>
          </div>
          {isAuthenticated && (
            <div className="flex items-center gap-2">
              {isManaging && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Division
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Create New Division</AlertDialogTitle>
                      <AlertDialogDescription>
                        Enter a name for the new division.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Label htmlFor="new-division-name">Division Name</Label>
                      <Input
                        id="new-division-name"
                        value={newDivisionName}
                        onChange={(e) => setNewDivisionName(e.target.value)}
                        placeholder="Enter division name"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNewDivisionName('')}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          handleCreateDivision(newDivisionName);
                          setNewDivisionName('');
                        }}
                        disabled={!newDivisionName.trim()}
                      >
                        Create
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                variant={isManaging ? "default" : "outline"}
                size="sm"
                onClick={() => setIsManaging(!isManaging)}
              >
                <Settings className="h-4 w-4 mr-1" />
                {isManaging ? 'Done' : 'Manage'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Display divisions side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {divisionStandings.map((division) => (
            <div key={division.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{division.name}</h3>
                  {isManaging && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setNewDivisionName(division.name);
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Rename Division</AlertDialogTitle>
                          <AlertDialogDescription>
                            Enter a new name for this division.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="py-4">
                          <Label htmlFor="division-name">Division Name</Label>
                          <Input
                            id="division-name"
                            value={newDivisionName}
                            onChange={(e) => setNewDivisionName(e.target.value)}
                            placeholder="Enter division name"
                          />
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setNewDivisionName('')}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDivisionRename(division.id, newDivisionName)}
                            disabled={!newDivisionName.trim()}
                          >
                            Save
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
                <Badge variant="secondary">
                  {division.teams.length} teams
                </Badge>
              </div>

              {division.teams.length > 0 ? (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead className="text-center">W-L-T</TableHead>
                        <TableHead className="text-center">Win %</TableHead>
                        <TableHead className="text-center">PF</TableHead>
                        <TableHead className="text-center">PA</TableHead>
                        <TableHead className="text-center">DIFF</TableHead>
                        {isManaging && <TableHead className="text-center">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {division.teams.map((team) => (
                        <TableRow
                          key={team.id}
                          className={team.isPlayoffSpot ? 'bg-green-50 dark:bg-green-900/20' : ''}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {team.divisionRank}
                              {team.isPlayoffSpot && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                  P
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{getMaskedTeamName(team, user, isAdmin)}</TableCell>
                          <TableCell className="text-muted-foreground">{getMaskedOwnerName(team, user, isAdmin)}</TableCell>
                          <TableCell className="text-center">
                            {team.wins}-{team.losses}-{team.ties}
                          </TableCell>
                          <TableCell className="text-center">
                            {((team.winPercentage || team.calculatedWinPct || 0) * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-center">
                            {(team.pointsFor || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            {(team.pointsAgainst || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={team.pointDifferential >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {team.pointDifferential >= 0 ? '+' : ''}{(team.pointDifferential || 0).toFixed(1)}
                            </span>
                          </TableCell>
                          {isManaging && (
                            <TableCell className="text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    Move
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuLabel>Move to Division</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {divisionStandings
                                    .filter(d => d.id !== division.id)
                                    .map(targetDivision => (
                                      <DropdownMenuItem
                                        key={targetDivision.id}
                                        onClick={() => handleTeamMove(team.id, targetDivision.id)}
                                      >
                                        {targetDivision.name}
                                      </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No teams assigned to this division
                </div>
              )}
            </div>
          ))}
        </div>

        {unassigned.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-muted-foreground">Unassigned</h3>
              <Badge variant="outline">
                {unassigned.length} teams
              </Badge>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-center">W-L-T</TableHead>
                    <TableHead className="text-center">Win %</TableHead>
                    <TableHead className="text-center">PF</TableHead>
                    <TableHead className="text-center">PA</TableHead>
                    <TableHead className="text-center">DIFF</TableHead>
                    {isManaging && <TableHead className="text-center">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassigned.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell className="font-medium">{getMaskedTeamName(team, user, isAdmin)}</TableCell>
                      <TableCell className="text-muted-foreground">{getMaskedOwnerName(team, user, isAdmin)}</TableCell>
                      <TableCell className="text-center">
                        {team.wins}-{team.losses}-{team.ties}
                      </TableCell>
                      <TableCell className="text-center">
                        {((team.winPercentage || team.calculatedWinPct || 0) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        {(team.pointsFor || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {(team.pointsAgainst || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={team.pointDifferential >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {team.pointDifferential >= 0 ? '+' : ''}{(team.pointDifferential || 0).toFixed(1)}
                        </span>
                      </TableCell>
                      {isManaging && (
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Assign
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel>Assign to Division</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {divisionStandings.map(targetDivision => (
                                <DropdownMenuItem
                                  key={targetDivision.id}
                                  onClick={() => handleTeamMove(team.id, targetDivision.id)}
                                >
                                  {targetDivision.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StandingsTable;