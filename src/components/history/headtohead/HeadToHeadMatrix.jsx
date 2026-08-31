import React, { useState, useMemo } from 'react';
import { Target, ArrowUpDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../ui/card';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { useHeadToHeadMatrix } from '../../../../hooks/queries/index.js';
import { getMaskedFranchiseName } from '../utils/privacyHelpers';

const HeadToHeadMatrix = ({
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onMatchupClick = () => {}
}) => {
  const { data: matrixData } = useHeadToHeadMatrix();
  const [sortBy, setSortBy] = useState('name'); // 'name', 'wins', 'winPct'

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

  /**
   * The cell's fill, as a diverging scale around an even record.
   *
   * These were nine hardcoded hexes, three of them (#1f2937, #4b5563,
   * #111827) dark-grey *text* colours from Tailwind's palette being used as
   * fills on an already-dark page, and the whole scale unrelated to the
   * theme's success/destructive pair — so a cell said "good" in a green the
   * rest of the app never uses. Inline styles stay: recharts is not involved,
   * but a table cell's background has to be a computed value here because the
   * scale is continuous in intent and the class set would be a ladder of
   * arbitrary opacities either way.
   */
  const getCellStyle = (wins, losses, hasPlayed) => {
    // Never played: recedes rather than reading as a result.
    if (!hasPlayed) {
      return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };
    }

    // 0-0, which is a meeting with no completed games rather than an even one.
    if (!wins && !losses) {
      return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };
    }

    const winPct = wins / (wins + losses);
    if (winPct >= 0.7) return { backgroundColor: 'hsl(var(--success) / 0.35)', color: 'hsl(var(--foreground))' };
    if (winPct > 0.5) return { backgroundColor: 'hsl(var(--success) / 0.18)', color: 'hsl(var(--foreground))' };
    if (winPct === 0.5) return { backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' };
    if (winPct >= 0.3) return { backgroundColor: 'hsl(var(--destructive) / 0.18)', color: 'hsl(var(--foreground))' };
    return { backgroundColor: 'hsl(var(--destructive) / 0.35)', color: 'hsl(var(--foreground))' };
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
                          <td key={col.franchiseId} className="p-1 text-center" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                            <span className="text-muted-foreground">—</span>
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
                                <span className="tabular text-xs font-medium">
                                  {hasPlayed ? `${wins}-${losses}` : '-'}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs z-50"
                              className="rounded-md border border-border bg-popover text-popover-foreground shadow-lg" style={{}}
                            >
                              <div className="space-y-1 p-1">
                                <p className="font-semibold">
                                  {getDisplayName(row.ownerName)} vs {getDisplayName(col.ownerName)}
                                </p>
                                {hasPlayed ? (
                                  <>
                                    <p>
                                      Record: <span className="tabular">{wins}-{losses}</span>
                                      {opponent?.totalGames > 0 && ` (${opponent.winPct}%)`}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Games: {opponent.totalGames} |
                                      PF: {opponent.pointsFor?.toFixed(0)} - PA: {opponent.pointsAgainst?.toFixed(0)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Click for full history
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
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

        {/* Legend.
            Each swatch is painted by `getCellStyle` rather than by its own
            copy of the colour, so the key cannot drift from the grid it
            explains — which it already had: the swatches were the pre-token
            hexes while the cells had moved on. */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>Win rate:</span>
          {[
            { label: 'Over 70%', wins: 8, losses: 2 },
            { label: '50-70%', wins: 6, losses: 4 },
            { label: 'Even', wins: 5, losses: 5 },
            { label: '30-50%', wins: 4, losses: 6 },
            { label: 'Under 30%', wins: 2, losses: 8 },
          ].map((entry) => (
            <div key={entry.label} className="flex items-center gap-1.5">
              <div
                className="h-4 w-4 rounded border border-border/50"
                style={{ backgroundColor: getCellStyle(entry.wins, entry.losses, true).backgroundColor }}
              />
              <span>{entry.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div
              className="h-4 w-4 rounded border border-border/50"
              style={{ backgroundColor: getCellStyle(0, 0, false).backgroundColor }}
            />
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
