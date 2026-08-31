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
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { getPositionColor } from '../../utils/positionColors';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { toast } from 'sonner';
import PageHeader from '../layout/PageHeader';
import { EmptyState } from '../ui/empty-state';

const TeamsAndRosters = ({
  teams = [],
  rosters = {},
  onAddTeam,
  onUpdateTeam,
  onRemoveTeam,
  loading = false,
  powerRankings = [],
  isAuthenticated = false, // This now represents isAdmin from parent
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    owner: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      // sonner, not `alert()`: a modal browser dialog blocks the page, cannot
      // be styled, and reads as a browser error rather than as this form
      // telling the user what it needs.
      toast.error('Enter a team name.');
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
      toast.error(`Could not save the team: ${error.message}`);
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
      toast.error(`Could not remove the team: ${error.message}`);
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
        <div className="mt-3 flex items-center justify-center">
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

    // No `.slice()`. The card used to cap starters at 9 and bench at 6 with no
    // "+N more" of any kind, so it presented a partial roster as a whole one —
    // and it did that inside a fixed-height box that was already scrolling,
    // which is where the rest of the list was assumed to be.
    const starters = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K']
      .map(slot => groupedRoster[slot] || [])
      .flat();

    const benchPlayers = groupedRoster['BE'] || [];
    const irPlayers = groupedRoster['IR'] || [];

    const CompactPlayerBadge = ({ player, slot }) => {
      const playerName = player.playerName || player.player?.name || 'Unknown';
      const position = player.position || player.player?.position || '?';
      const isStarter = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'].includes(slot);

      return (
        <div
          className={`flex items-center gap-1.5 p-1.5 rounded text-xs border ${
            isStarter
              ? 'bg-card border-border font-medium'
              : slot === 'IR'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'bg-muted/50 border-muted text-muted-foreground'
          }`}
          title={`${playerName} (${position})${slot !== 'BE' && slot !== 'IR' ? ` - ${slot}` : ''}`}
        >
          <Badge
            variant="outline"
            className={`text-xs h-4 px-1 w-10 justify-center ${getPositionColor(position)}`}
          >
            {position}
          </Badge>
          <span className="truncate" style={{maxWidth: '200px'}}>{playerName}</span>
          {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
            <div className="w-2 h-2 bg-destructive rounded-full" title={player.injuryStatus} />
          )}
        </div>
      );
    };

    // No inner scroller. With the card sized to its content there is nothing
    // to scroll against, and a nested scroll region inside the page's own
    // scroll is what made these cards awkward to read on a phone.
    return (
      <div className="mt-3">
        <div className="space-y-3">
          {/* Starting Lineup Grid */}
          {starters.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-card py-1">
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
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-card py-1">
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
              <h4 className="text-xs font-semibold text-destructive uppercase tracking-wide sticky top-0 bg-card py-1">
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
      <PageHeader
        icon={Users}
        title="Teams & Rosters"
        description={`${teams.length} ${teams.length === 1 ? 'team' : 'teams'} in the league`}
        className="mb-0"
        actions={
          isAuthenticated && (
            <Button onClick={() => setShowAddForm(true)} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add team
            </Button>
          )
        }
      />

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
        <Card>
          <EmptyState
            icon={Users}
            title="No teams yet"
            description="Power rankings, the schedule and standings all build on the team list."
            action={
              isAuthenticated && (
                <Button onClick={() => setShowAddForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add the first team
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {moveUserTeamToFirst(teams, user).map(team => {
            const rank = getTeamRanking(team.id);
            const stats = getTeamStats(team.id);
            const teamRoster = rosters[team.id]?.roster || [];

            // No fixed height at all now. `sm:h-[750px]` forced every card to
            // one size regardless of roster length — a short roster left a
            // stretch of dead space, a long one hid its tail in an inner
            // scroller, and on a phone `max-h-[70vh]` meant every card ended
            // mid-list with a scroll region inside the page's own scroll.
            // Cards are as tall as their content; the page scrolls.
            return (
              <Card key={team.id} className="flex flex-col transition-colors">
                <CardContent className="p-4 flex flex-col h-full">
                  {/* Team Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold truncate">{getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</h3>
                        {rank && (
                          <Badge variant={getRankBadgeVariant(rank)} className="gap-1 shrink-0">
                            {getRankIcon(rank)}
                            #{rank}
                          </Badge>
                        )}
                      </div>

                      {team.owner && (
                        <div className="text-sm text-muted-foreground truncate">
                          <strong>Owner:</strong> {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
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
                          className="h-8 w-8 p-0 pointer-coarse:h-11 pointer-coarse:w-11"
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive pointer-coarse:h-11 pointer-coarse:w-11"
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
                          (stats.wins || 0) < (stats.losses || 0) ? 'text-red-600' : 'text-muted-foreground'
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
