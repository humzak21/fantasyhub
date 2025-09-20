import React, { useState } from 'react';
import { Users, Star, Zap, Shield, ChevronDown, ChevronUp, Target, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

const TeamRoster = ({ roster = [], teamName = '', loading = false, compact = false }) => {
  const [expanded, setExpanded] = useState(!compact);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-3">
          <div className="h-5 bg-muted rounded w-24"></div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 bg-muted rounded w-8"></div>
              <div className="h-4 bg-muted rounded flex-1"></div>
              <div className="h-4 bg-muted rounded w-12"></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!roster || roster.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-sm text-muted-foreground">
              No roster data available
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group players by roster slot
  const groupedRoster = roster.reduce((acc, player) => {
    const slot = player.rosterSlot || 'BE';
    if (!acc[slot]) {
      acc[slot] = [];
    }
    acc[slot].push(player);
    return acc;
  }, {});

  // Define slot order and display names
  const slotOrder = [
    { key: 'QB', name: 'Quarterback', icon: Star },
    { key: 'RB', name: 'Running Back', icon: Zap },
    { key: 'WR', name: 'Wide Receiver', icon: Zap },
    { key: 'TE', name: 'Tight End', icon: Shield },
    { key: 'FLEX', name: 'Flex', icon: Star },
    { key: 'K', name: 'Kicker', icon: Target },
    { key: 'D/ST', name: 'Defense', icon: Shield },
    { key: 'BE', name: 'Bench', icon: Users },
    { key: 'IR', name: 'Injured Reserve', icon: AlertCircle }
  ];

  const getPositionColor = (position) => {
    const colors = {
      QB: 'bg-red-100 text-red-700 border-red-200',
      RB: 'bg-green-100 text-green-700 border-green-200',
      WR: 'bg-blue-100 text-blue-700 border-blue-200',
      TE: 'bg-orange-100 text-orange-700 border-orange-200',
      K: 'bg-purple-100 text-purple-700 border-purple-200',
      'D/ST': 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[position] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getSlotBadgeColor = (slot) => {
    if (['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST'].includes(slot)) {
      return 'default';
    }
    if (slot === 'IR') {
      return 'destructive';
    }
    return 'secondary';
  };

  const PlayerRow = ({ player, slot }) => {
    // Handle both old format (player.player.name) and new format (player.playerName)
    const playerName = player.playerName || player.player?.name || 'Unknown Player';
    const position = player.position || player.player?.position || '?';
    const teamAbbrev = player.proTeamName || player.player?.teamAbbreviation;
    
    return (
      <div className="flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-md group">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Badge 
            variant="outline" 
            className={`text-xs font-mono ${getPositionColor(position)}`}
          >
            {position}
          </Badge>
          
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">
              {playerName}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {teamAbbrev && <span>{teamAbbrev}</span>}
              {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
                <Badge variant="destructive" className="text-xs h-4">
                  {player.injuryStatus}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Points column */}
          <div className="text-right">
            <div className="text-sm font-medium">
              {player.seasonActualPoints ? player.seasonActualPoints.toFixed(1) : '0.0'}
            </div>
            <div className="text-xs text-muted-foreground">
              {player.averagePointsPerGame || '0.0'} avg
            </div>
          </div>
          
          {/* Projected points (smaller) */}
          {player.seasonProjectedPoints > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                Proj: {player.seasonProjectedPoints.toFixed(1)}
              </div>
            </div>
          )}

          {player.isKeeper && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              Keeper
            </Badge>
          )}
          
          {slot !== 'BE' && slot !== 'IR' && (
            <Badge variant={getSlotBadgeColor(slot)} className="text-xs">
              {slot}
            </Badge>
          )}
          
          {player.acquisitionType === 'waiver' && player.cost > 0 && (
            <span className="text-xs text-muted-foreground">
              ${player.cost}
            </span>
          )}
        </div>
      </div>
    );
  };

  const starters = slotOrder
    .filter(({ key }) => ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST'].includes(key))
    .filter(({ key }) => groupedRoster[key] && groupedRoster[key].length > 0);

  const benchPlayers = groupedRoster['BE'] || [];
  const irPlayers = groupedRoster['IR'] || [];

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Roster {teamName && `- ${teamName}`}
          </CardTitle>
          
          {compact && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8 p-0"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{roster.length} total players</span>
            <span>{starters.reduce((acc, { key }) => acc + (groupedRoster[key]?.length || 0), 0)} starters</span>
            {benchPlayers.length > 0 && <span>{benchPlayers.length} bench</span>}
            {irPlayers.length > 0 && <span>{irPlayers.length} IR</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            Points: Season Total / Avg Per Game
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Starting Lineup */}
          {starters.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Starting Lineup
              </h4>
              <div className="space-y-1">
                {starters.map(({ key, name }) => (
                  <div key={key}>
                    {groupedRoster[key].map((player, idx) => (
                      <PlayerRow key={`${key}-${idx}`} player={player} slot={key} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bench */}
          {benchPlayers.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Bench ({benchPlayers.length})
              </h4>
              <div className="space-y-1">
                {benchPlayers.map((player, idx) => (
                  <PlayerRow key={`bench-${idx}`} player={player} slot="BE" />
                ))}
              </div>
            </div>
          )}

          {/* Injured Reserve */}
          {irPlayers.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Injured Reserve ({irPlayers.length})
              </h4>
              <div className="space-y-1">
                {irPlayers.map((player, idx) => (
                  <PlayerRow key={`ir-${idx}`} player={player} slot="IR" />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default TeamRoster;