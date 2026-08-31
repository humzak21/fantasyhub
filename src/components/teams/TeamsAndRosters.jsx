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
import { TeamIdentity } from '../ui/team-identity';
import { IndependentColumns } from '../ui/independent-columns';
import { isUserTeam } from '../../utils/userTeamUtils';

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

      // A roster is a list. Boxing each of sixteen players in its own bordered,
      // filled rectangle turned a card into a stack of tiles and made the
      // position chip — the only thing that needs to be scannable — compete
      // with a border for attention.
      return (
        <div
          className={`flex items-center gap-2.5 rounded px-1 py-[3px] text-xs ${
            isStarter ? 'text-foreground' : 'text-muted-foreground'
          }`}
          title={`${playerName} (${position})${slot !== 'BE' && slot !== 'IR' ? ` - ${slot}` : ''}`}
        >
          <span
            className={`w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold ${getPositionColor(position)}`}
          >
            {position}
          </span>
          <span className="min-w-0 flex-1 truncate">{playerName}</span>
          {slot === 'IR' && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-destructive">
              IR
            </span>
          )}
          {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && slot !== 'IR' && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
              title={player.injuryStatus}
            />
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
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                Starters
              </h4>
              <div className="grid grid-cols-1 gap-px">
                {starters.map((player, idx) => (
                  <CompactPlayerBadge key={`starter-${idx}`} player={player} slot={player.rosterSlot} />
                ))}
              </div>
            </div>
          )}

          {/* Bench Players */}
          {benchPlayers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                Bench
              </h4>
              <div className="grid grid-cols-1 gap-px">
                {benchPlayers.map((player, idx) => (
                  <CompactPlayerBadge key={`bench-${idx}`} player={player} slot="BE" />
                ))}
              </div>
            </div>
          )}

          {/* IR Players */}
          {irPlayers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.07em] text-destructive">
                Injured reserve
              </h4>
              <div className="grid grid-cols-1 gap-px">
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
        // Same independent columns as the schedule: a roster is as tall as it
        // is, and no card should be dragged down by the one beside it.
        <IndependentColumns
          items={moveUserTeamToFirst(teams, user)}
          itemKey={(team) => team.id}
          columns={3}
        >
          {(team) => {
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
              <Card>
                <CardContent>
                  {/* Team Header. The identity chip, the name, the owner and
                      the record read as one block — the version this replaces
                      spelled out "Owner:" and "Record" as labels and stacked
                      them, which spent four lines saying what the shape of the
                      information already says. */}
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <TeamIdentity
                        team={{
                          ...team,
                          name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
                          ownerName: getMaskedOwnerName(team, user, isAdmin, teamOwnerNames),
                          wins: stats.wins,
                          losses: stats.losses,
                          ties: stats.ties,
                        }}
                        size="md"
                        showOwner={Boolean(team.owner)}
                        showRecord={stats.gamesPlayed > 0}
                        isViewer={isUserTeam(team, user)}
                        meta={rank ? `#${rank}` : null}
                      />

                    </div>

                    {/* Actions */}
                    {isAuthenticated && (
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <Button
                          onClick={() => handleEdit(team)}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
                          aria-label={`Edit ${team.name}`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive pointer-coarse:h-11 pointer-coarse:w-11"
                              aria-label={`Remove ${team.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

                  {/* Compact Roster Section */}
                  <CompactTeamRoster team={team} roster={teamRoster} />
                </CardContent>
              </Card>
            );
          }}
        </IndependentColumns>
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
