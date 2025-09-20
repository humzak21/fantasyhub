import React, { useState } from 'react';
import { Edit2, Settings, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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

const DrawerStandingsTable = ({
  teams = [],
  divisions = [],
  standings = { divisions: [], unassigned: [] },
  currentWeek,
  loading = false,
  isAuthenticated = false,
  onDivisionRename,
  onTeamDivisionChange,
  onCreateDivision,
  onClose
}) => {
  const [isManaging, setIsManaging] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');

  // Calculate standings data
  const calculateStandings = () => {
    // If we have standings from the database, use those
    if (standings && (standings.divisions?.length > 0 || standings.unassigned?.length > 0)) {
      // Merge the standings with division info
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

    // Group teams by division
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
        const aWinPct = a.winPercentage || a.win_percentage || 0;
        const bWinPct = b.winPercentage || b.win_percentage || 0;
        if (aWinPct !== bWinPct) {
          return bWinPct - aWinPct;
        }

        const aPointsFor = a.pointsFor || a.points_for || 0;
        const bPointsFor = b.pointsFor || b.points_for || 0;
        if (aPointsFor !== bPointsFor) {
          return bPointsFor - aPointsFor;
        }

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
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
        pointsFor: parseFloat(team.pointsFor || team.points_for || 0),
        pointsAgainst: parseFloat(team.pointsAgainst || team.points_against || 0),
        pointDifferential: parseFloat(team.pointDifferential || team.point_differential || 0),
        winPercentage: parseFloat(team.winPercentage || team.win_percentage || 0),
        calculatedWinPct: team.wins + team.losses + team.ties > 0
          ? team.wins / (team.wins + team.losses + team.ties)
          : 0,
        divisionRank: index + 1,
        isPlayoffSpot: index < 3, // Top 3 teams per division make playoffs
        streak: formatStreak(team.currentStreak || team.current_streak)
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
      wins: team.wins || 0,
      losses: team.losses || 0,
      ties: team.ties || 0,
      pointsFor: parseFloat(team.pointsFor || team.points_for || 0),
      pointsAgainst: parseFloat(team.pointsAgainst || team.points_against || 0),
      pointDifferential: parseFloat(team.pointDifferential || team.point_differential || 0),
      winPercentage: parseFloat(team.winPercentage || team.win_percentage || 0),
      calculatedWinPct: team.wins + team.losses + team.ties > 0
        ? team.wins / (team.wins + team.losses + team.ties)
        : 0,
      divisionRank: index + 1,
      isPlayoffSpot: false,
      streak: formatStreak(team.currentStreak || team.current_streak)
    }));

    return {
      divisions: divisionStandings,
      unassigned: unassignedTeams
    };
  };

  const formatStreak = (streak) => {
    if (!streak) return '';
    if (typeof streak === 'string') return streak;
    if (typeof streak === 'object' && streak.type && streak.length) {
      const type = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : '';
      return type ? `${type}${streak.length}` : '';
    }
    return '';
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
      <div className="space-y-4">
        {/* Loading header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
        </div>
        
        {/* Loading divisions */}
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            {/* Division header loading */}
            <div className="flex items-center justify-between px-1">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
            
            {/* Table loading */}
            <div className="rounded-md border">
              <div className="p-2 border-b">
                <div className="flex gap-2">
                  <div className="h-3 w-8 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-12 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-8 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-8 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-8 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
              {[1, 2, 3].map((j) => (
                <div key={j} className="p-2 border-b last:border-b-0">
                  <div className="flex gap-2">
                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with management controls and close button */}
      <div className="flex items-center justify-between px-1 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Standings</h2>
          {currentWeek && (
            <Badge variant="outline" className="text-xs">
              Week {currentWeek}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <div className="flex items-center gap-1">
              {isManaging && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs px-2 py-1">
                      <Plus className="h-3 w-3 mr-1" />
                      Add
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
                className="text-xs px-2 py-1"
                onClick={() => setIsManaging(!isManaging)}
              >
                <Settings className="h-3 w-3 mr-1" />
                {isManaging ? 'Done' : 'Manage'}
              </Button>
            </div>
          )}
          <button
            onClick={onClose}
            className="p-2 sm:p-3 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 touch-manipulation focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Close standings drawer"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Divisions stacked vertically */}
      <div className="space-y-4">
        {divisionStandings.map((division) => (
          <div key={division.id} className="space-y-2">
            {/* Compact division header */}
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-base font-semibold">{division.name}</h3>
              {isManaging && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
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

            {/* Full table for drawer */}
            {division.teams.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow className="text-sm">
                      <TableHead className="w-12 px-3 py-2 text-sm">#</TableHead>
                      <TableHead className="px-3 py-2 text-sm min-w-[140px]">Team</TableHead>
                      <TableHead className="px-3 py-2 text-sm min-w-[120px]">Owner</TableHead>
                      <TableHead className="w-20 px-2 py-2 text-center text-sm">Record</TableHead>
                      <TableHead className="w-16 px-2 py-2 text-center text-sm">PCT</TableHead>
                      <TableHead className="w-16 px-2 py-2 text-center text-sm">PF</TableHead>
                      <TableHead className="w-16 px-2 py-2 text-center text-sm">PA</TableHead>
                      <TableHead className="w-16 px-2 py-2 text-center text-sm">Diff</TableHead>
                      <TableHead className="w-16 px-2 py-2 text-center text-sm">Streak</TableHead>
                      {isManaging && <TableHead className="w-20 px-2 py-2 text-center text-sm">Move</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {division.teams.map((team) => (
                      <TableRow
                        key={team.id}
                        className={`text-sm transition-all duration-200 hover:bg-muted/50 ${
                          team.isPlayoffSpot ? 'bg-green-50 dark:bg-green-900/20' : ''
                        }`}
                      >
                        <TableCell className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            <span>
                              {team.divisionRank}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2 font-medium">
                          {team.name}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-muted-foreground">
                          {team.owner || 'N/A'}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-center">
                          {team.wins}-{team.losses}-{team.ties}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-center">
                          {(team.winPercentage || team.calculatedWinPct || 0).toFixed(3)}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-center">
                          {(team.pointsFor || 0).toFixed(0)}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-center">
                          {(team.pointsAgainst || 0).toFixed(0)}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-center">
                          <span className={`font-medium ${
                            team.pointDifferential >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {team.pointDifferential >= 0 ? '+' : ''}{(team.pointDifferential || 0).toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-2 text-center">
                          <Badge variant="outline" className="text-xs">
                            {team.streak || '-'}
                          </Badge>
                        </TableCell>
                        {isManaging && (
                          <TableCell className="px-2 py-2 text-center">
                            <div className="flex flex-col gap-1">
                              {divisionStandings
                                .filter(d => d.id !== division.id)
                                .map(targetDivision => (
                                  <Button
                                    key={targetDivision.id}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs px-2 py-1 h-6"
                                    onClick={() => handleTeamMove(team.id, targetDivision.id)}
                                  >
                                    → {targetDivision.name}
                                  </Button>
                                ))}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-xs">
                No teams assigned
              </div>
            )}
          </div>
        ))}

        {/* Unassigned teams section */}
        {unassigned.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-base font-semibold text-muted-foreground">Unassigned</h3>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow className="text-sm">
                    <TableHead className="px-3 py-2 text-sm min-w-[140px]">Team</TableHead>
                    <TableHead className="px-3 py-2 text-sm min-w-[120px]">Owner</TableHead>
                    <TableHead className="w-20 px-2 py-2 text-center text-sm">Record</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-center text-sm">PCT</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-center text-sm">PF</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-center text-sm">PA</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-center text-sm">Diff</TableHead>
                    <TableHead className="w-16 px-2 py-2 text-center text-sm">Streak</TableHead>
                    {isManaging && <TableHead className="w-20 px-2 py-2 text-center text-sm">Assign</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassigned.map((team) => (
                    <TableRow
                      key={team.id}
                      className="text-sm transition-all duration-200 hover:bg-muted/50"
                    >
                      <TableCell className="px-3 py-2 font-medium">
                        {team.name}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-muted-foreground">
                        {team.owner || 'N/A'}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        {team.wins}-{team.losses}-{team.ties}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        {(team.winPercentage || team.calculatedWinPct || 0).toFixed(3)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        {(team.pointsFor || 0).toFixed(0)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        {(team.pointsAgainst || 0).toFixed(0)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        <span className={`font-medium ${
                          team.pointDifferential >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {team.pointDifferential >= 0 ? '+' : ''}{(team.pointDifferential || 0).toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        <Badge variant="outline" className="text-xs">
                          {team.streak || '-'}
                        </Badge>
                      </TableCell>
                      {isManaging && (
                        <TableCell className="px-2 py-2 text-center">
                          <div className="flex flex-col gap-1">
                            {divisionStandings.map(targetDivision => (
                              <Button
                                key={targetDivision.id}
                                variant="outline"
                                size="sm"
                                className="text-xs px-2 py-1 h-6"
                                onClick={() => handleTeamMove(team.id, targetDivision.id)}
                              >
                                → {targetDivision.name}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DrawerStandingsTable;