import React, { useState } from 'react';
import { Users, Plus, Edit3, Trash2, Trophy, Target, TrendingUp, Crown, Medal, Award, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
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
import { moveUserTeamToFirst } from '../../utils/userTeamUtils';

const TeamsAndRosters = ({
  teams = [],
  rosters = {},
  onAddTeam,
  onUpdateTeam,
  onRemoveTeam,
  loading = false,
  powerRankings = [],
  isAuthenticated = false, // This now represents isAdmin from parent
  user = null
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    owner: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Team name is required');
      return;
    }

    try {
      if (editingTeam) {
        await onUpdateTeam(editingTeam.id, {
          name: formData.name.trim(),
          owner: formData.owner.trim()
        });
        setEditingTeam(null);
      } else {
        await onAddTeam(formData.name.trim(), formData.owner.trim());
        setShowAddForm(false);
      }
      
      setFormData({ name: '', owner: '' });
    } catch (error) {
      alert('Error saving team: ' + error.message);
    }
  };

  const handleEdit = (team) => {
    setEditingTeam(team);
    setFormData({
      name: team.name,
      owner: team.owner || ''
    });
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    setEditingTeam(null);
    setShowAddForm(false);
    setFormData({ name: '', owner: '' });
  };

  const handleRemove = async (team) => {
    try {
      await onRemoveTeam(team.id);
    } catch (error) {
      alert('Error removing team: ' + error.message);
    }
  };


  const getTeamRanking = (teamId) => {
    const ranking = powerRankings.find(r => (r.teamId || r.id) === teamId);
    return ranking ? ranking.rank : null;
  };

  const getTeamStats = (teamId) => {
    const ranking = powerRankings.find(r => (r.teamId || r.id) === teamId);
    return ranking || {};
  };

  const getRankBadgeVariant = (rank) => {
    if (!rank) return 'secondary';
    if (rank === 1) return 'default';
    if (rank <= 3) return 'secondary';
    if (rank <= 6) return 'outline';
    return 'secondary';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown className="h-3 w-3" />;
    if (rank <= 3) return <Medal className="h-3 w-3" />;
    if (rank <= 6) return <Award className="h-3 w-3" />;
    return <Trophy className="h-3 w-3" />;
  };

  // Roster helper functions
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


  const CompactTeamRoster = ({ team, roster }) => {
    if (!roster || roster.length === 0) {
      return (
        <div className="mt-3 h-full flex items-center justify-center">
          <div className="p-3 border rounded-lg bg-muted/10">
            <div className="text-center text-xs text-muted-foreground">
              No roster data
            </div>
          </div>
        </div>
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

    const starters = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K']
      .map(slot => groupedRoster[slot] || [])
      .flat()
      .slice(0, 9); // Show max 9 starters

    const benchPlayers = (groupedRoster['BE'] || []).slice(0, 6); // Show max 6 bench players
    const irPlayers = groupedRoster['IR'] || [];

    const CompactPlayerBadge = ({ player, slot }) => {
      const playerName = player.playerName || player.player?.name || 'Unknown';
      const position = player.position || player.player?.position || '?';
      const isStarter = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'].includes(slot);

      return (
        <div
          className={`flex items-center gap-1.5 p-1.5 rounded text-xs border ${
            isStarter
              ? 'bg-white border-gray-200 font-medium'
              : slot === 'IR'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-muted/50 border-muted text-muted-foreground'
          }`}
          title={`${playerName} (${position})${slot !== 'BE' && slot !== 'IR' ? ` - ${slot}` : ''}`}
        >
          <Badge
            variant="outline"
            className={`text-xs h-4 px-1 ${getPositionColor(position)}`}
          >
            {position}
          </Badge>
          <span className="truncate" style={{maxWidth: '200px'}}>{playerName}</span>
          {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
            <div className="w-2 h-2 bg-red-500 rounded-full" title={player.injuryStatus} />
          )}
        </div>
      );
    };

    return (
      <div className="mt-3 h-full flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Starting Lineup Grid */}
          {starters.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-white py-1">
                Starters
              </h4>
              <div className="grid grid-cols-1 gap-1">
                {starters.map((player, idx) => (
                  <CompactPlayerBadge key={`starter-${idx}`} player={player} slot={player.rosterSlot} />
                ))}
              </div>
            </div>
          )}

          {/* Bench Players */}
          {benchPlayers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-white py-1">
                Bench
              </h4>
              <div className="grid grid-cols-1 gap-1">
                {benchPlayers.map((player, idx) => (
                  <CompactPlayerBadge key={`bench-${idx}`} player={player} slot="BE" />
                ))}
              </div>
            </div>
          )}

          {/* IR Players */}
          {irPlayers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wide sticky top-0 bg-white py-1">
                Injured Reserve
              </h4>
              <div className="grid grid-cols-1 gap-1">
                {irPlayers.map((player, idx) => (
                  <CompactPlayerBadge key={`ir-${idx}`} player={player} slot="IR" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Teams & Rosters</h2>
            <p className="text-muted-foreground">Manage teams and view player rosters</p>
          </div>
        </div>
        
        {isAuthenticated && (
          <Button onClick={() => setShowAddForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Team
          </Button>
        )}
      </div>

      {/* Add/Edit Team Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingTeam ? 'Edit Team' : 'Add New Team'}</CardTitle>
            <CardDescription>
              {editingTeam ? 'Update team information' : 'Create a new team for your league'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="teamName">Team Name *</Label>
                  <Input
                    id="teamName"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter team name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="owner">Owner (Optional)</Label>
                  <Input
                    id="owner"
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                    placeholder="Enter owner name"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : editingTeam ? 'Update Team' : 'Add Team'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Teams List */}
      {teams.length === 0 ? (
        <Card className="p-8">
          <CardContent className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">No Teams Yet</h3>
              <p className="text-muted-foreground">
                Add your first team to get started with power rankings!
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {moveUserTeamToFirst(teams, user).map(team => {
            const rank = getTeamRanking(team.id);
            const stats = getTeamStats(team.id);
            const teamRoster = rosters[team.id]?.roster || [];

            return (
              <Card key={team.id} className="hover:shadow-lg transition-shadow h-[750px] flex flex-col">
                <CardContent className="p-4 flex flex-col h-full">
                  {/* Team Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold truncate">{team.name}</h3>
                        {rank && (
                          <Badge variant={getRankBadgeVariant(rank)} className="gap-1 shrink-0">
                            {getRankIcon(rank)}
                            #{rank}
                          </Badge>
                        )}
                      </div>

                      {team.owner && (
                        <div className="text-sm text-muted-foreground truncate">
                          <strong>Owner:</strong> {team.owner}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {isAuthenticated && (
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <Button
                          onClick={() => handleEdit(team)}
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Team</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove {team.name}? This will also remove all their games and cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemove(team)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove Team
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>

                  {/* Team Stats - Only Record */}
                  {stats.gamesPlayed > 0 && (
                    <div className="mb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="text-xs">Record</span>
                        </div>
                        <div className={`font-semibold ${
                          (stats.wins || 0) > (stats.losses || 0) ? 'text-green-600' :
                          (stats.wins || 0) < (stats.losses || 0) ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {stats.wins || 0}-{stats.losses || 0}
                          {stats.ties > 0 && `-${stats.ties}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Compact Roster Section */}
                  <div className="flex-1 overflow-hidden">
                    <CompactTeamRoster team={team} roster={teamRoster} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Stats */}
      {teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              League Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Total Teams</div>
                <div className="text-2xl font-bold">{teams.length}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">With Owners</div>
                <div className="text-2xl font-bold">
                  {teams.filter(team => team.owner && team.owner.trim()).length}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Active Teams</div>
                <div className="text-2xl font-bold">
                  {powerRankings.filter(r => r.gamesPlayed > 0).length}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">With Rosters</div>
                <div className="text-2xl font-bold">
                  {teams.filter(team => rosters[team.id]?.roster?.length > 0).length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeamsAndRosters;
