import React, { useState, useEffect, useMemo } from 'react';
import { Target, ArrowUpDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../ui/card';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { useLeagueHistory } from '../../../hooks/useLeagueHistory';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';

const HeadToHeadMatrix = ({
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onMatchupClick = () => {}
}) => {
  const { getHeadToHeadMatrix, loading } = useLeagueHistory();
  const [matrixData, setMatrixData] = useState(null);
  const [sortBy, setSortBy] = useState('name'); // 'name', 'wins', 'winPct'

  // Load matrix data on mount
  useEffect(() => {
    const loadMatrix = async () => {
      const data = await getHeadToHeadMatrix();
      setMatrixData(data);
    };
    loadMatrix();
  }, [getHeadToHeadMatrix]);

  // Sort matrix data
  const displayData = useMemo(() => {
    if (!matrixData?.matrix) return [];

    let data = [...matrixData.matrix];

    // Sort
    data.sort((a, b) => {
      if (sortBy === 'name') {
        return a.ownerName.localeCompare(b.ownerName);
      }
      // Calculate total wins
      const aWins = Object.values(a.opponents || {}).reduce((sum, opp) => sum + (opp.wins || 0), 0);
      const bWins = Object.values(b.opponents || {}).reduce((sum, opp) => sum + (opp.wins || 0), 0);

      if (sortBy === 'wins') {
        return bWins - aWins;
      }

      // Win percentage
      const aGames = Object.values(a.opponents || {}).reduce((sum, opp) => sum + (opp.totalGames || 0), 0);
      const bGames = Object.values(b.opponents || {}).reduce((sum, opp) => sum + (opp.totalGames || 0), 0);
      const aWinPct = aGames > 0 ? aWins / aGames : 0;
      const bWinPct = bGames > 0 ? bWins / bGames : 0;

      return bWinPct - aWinPct;
    });

    return data;
  }, [matrixData, sortBy]);

  // Get cell color based on win percentage - more saturated for better contrast
  // Using inline styles for reliable color rendering
  const getCellStyle = (wins, losses, hasPlayed) => {
    // Never played - show distinct gray
    if (!hasPlayed) return { backgroundColor: '#1f2937', color: '#6b7280' }; // gray-800 bg, gray-500 text

    // 0-0 ties edge case
    if (!wins && !losses) return { backgroundColor: '#4b5563', color: '#d1d5db' }; // gray-600

    const winPct = wins / (wins + losses);
    if (winPct >= 0.7) return { backgroundColor: '#059669', color: '#ffffff' }; // emerald-600
    if (winPct >= 0.5) return { backgroundColor: '#34d399', color: '#000000' }; // emerald-400
    if (winPct >= 0.3) return { backgroundColor: '#f87171', color: '#000000' }; // red-400
    return { backgroundColor: '#dc2626', color: '#ffffff' }; // red-600
  };

  // Get display name with masking
  const getDisplayName = (ownerName) => {
    const franchise = franchises.find(f => f.owner_name === ownerName);
    if (!franchise) return ownerName;
    return getMaskedFranchiseName(franchise, user, isAdmin, teamOwnerNames);
  };

  // Get first name for compact display
  const getFirstName = (name) => {
    if (!name) return '??';
    return name.split(' ')[0];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Head-to-Head Matrix
        </CardTitle>
        <CardDescription>
          All-time records between franchises. Click a cell to see detailed matchup history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Sort Controls */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={sortBy === 'name' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('name')}
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            Name
          </Button>
          <Button
            variant={sortBy === 'wins' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('wins')}
          >
            Total Wins
          </Button>
          <Button
            variant={sortBy === 'winPct' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('winPct')}
          >
            Win %
          </Button>
        </div>

        {/* Matrix */}
        <TooltipProvider delayDuration={100}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left font-semibold sticky left-0 bg-background z-10">
                    vs
                  </th>
                  {displayData.map(row => (
                    <th
                      key={row.franchiseId}
                      className="p-1 text-center font-medium min-w-[60px]"
                      title={getDisplayName(row.ownerName)}
                    >
                      <span className="text-xs">{getFirstName(row.ownerName)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayData.map(row => (
                  <tr key={row.franchiseId}>
                    <td className="p-2 font-medium sticky left-0 bg-background z-10 whitespace-nowrap">
                      {getDisplayName(row.ownerName)}
                    </td>
                    {displayData.map(col => {
                      const isSelf = row.franchiseId === col.franchiseId;
                      const opponent = row.opponents?.[col.franchiseId];
                      const hasPlayed = opponent && opponent.totalGames > 0;
                      const wins = opponent?.wins || 0;
                      const losses = opponent?.losses || 0;

                      if (isSelf) {
                        return (
                          <td key={col.franchiseId} className="p-1 text-center" style={{ backgroundColor: '#111827' }}>
                            <span style={{ color: '#6b7280' }}>-</span>
                          </td>
                        );
                      }

                      const cellStyle = getCellStyle(wins, losses, hasPlayed);

                      return (
                        <td key={col.franchiseId} className="p-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="w-full p-2 text-center cursor-pointer transition-opacity hover:opacity-80 min-w-[48px]"
                                style={cellStyle}
                                onClick={() => onMatchupClick(row.franchiseId, col.franchiseId)}
                                disabled={!hasPlayed}
                              >
                                <span className="font-mono text-xs font-medium">
                                  {hasPlayed ? `${wins}-${losses}` : '-'}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs z-50"
                              style={{ backgroundColor: '#1f2937', color: '#f9fafb', border: '1px solid #374151' }}
                            >
                              <div className="space-y-1 p-1">
                                <p className="font-semibold">
                                  {getDisplayName(row.ownerName)} vs {getDisplayName(col.ownerName)}
                                </p>
                                {hasPlayed ? (
                                  <>
                                    <p>
                                      Record: <span className="font-mono">{wins}-{losses}</span>
                                      {opponent?.totalGames > 0 && ` (${opponent.winPct}%)`}
                                    </p>
                                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                                      Games: {opponent.totalGames} |
                                      PF: {opponent.pointsFor?.toFixed(0)} - PA: {opponent.pointsAgainst?.toFixed(0)}
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                                      Click for full history
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-xs" style={{ color: '#9ca3af' }}>
                                    No matchup history yet
                                  </p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>Win rate:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#059669' }}></div>
            <span>&gt;70%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#34d399' }}></div>
            <span>50-70%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f87171' }}></div>
            <span>30-50%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#dc2626' }}></div>
            <span>&lt;30%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#1f2937' }}></div>
            <span>Never played</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Records shown are from the row franchise's perspective (W-L). Hover for details, click for full history.
        </p>
      </CardContent>
    </Card>
  );
};

export default HeadToHeadMatrix;
