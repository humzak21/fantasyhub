import React, { useState } from 'react';
import { Users, Plus, Edit3, Trash2, Trophy, Target, TrendingUp, Crown, Medal, Award } from 'lucide-react';
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

const TeamManager = ({ 
  teams = [], 
  onAddTeam, 
  onUpdateTeam, 
  onRemoveTeam, 
  loading = false,
  powerRankings = [],
  isAuthenticated = false // This now represents isAdmin from parent
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Team Management</h2>
            <p className="text-muted-foreground">Manage your fantasy football teams</p>
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
        <div className="grid gap-4">
          {teams.map(team => {
            const rank = getTeamRanking(team.id);
            const stats = getTeamStats(team.id);
            
            return (
              <Card key={team.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold">{team.name}</h3>
                        
                        {rank && (
                          <Badge variant={getRankBadgeVariant(rank)} className="gap-1">
                            {getRankIcon(rank)}
                            #{rank}
                          </Badge>
                        )}
                      </div>
                    
                      {team.owner && (
                        <div className="text-muted-foreground mb-3">
                          <strong>Owner:</strong> {team.owner}
                        </div>
                      )}

                      {/* Team Stats */}
                      {stats.gamesPlayed > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Target className="h-3 w-3" />
                              <span className="text-xs">Record</span>
                            </div>
                            <div className="font-semibold">
                              {stats.wins || 0}-{stats.losses || 0}
                              {stats.ties > 0 && `-${stats.ties}`}
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <TrendingUp className="h-3 w-3" />
                              <span className="text-xs">Win%</span>
                            </div>
                            <div className="font-semibold">
                              {((stats.winPercentage || 0) * 100).toFixed(1)}%
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Points For</div>
                            <div className="font-semibold">{(stats.pointsFor || 0).toFixed(1)}</div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Total Point Diff</div>
                            <div className={`font-semibold ${
                              (stats.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {(stats.pointDifferential || 0) >= 0 ? '+' : ''}
                              {(stats.pointDifferential || 0).toFixed(1)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Advanced Stats */}
                      {stats.gamesPlayed > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Badge variant="outline" className="text-xs">
                            PPG: {(stats.averagePointsFor || 0).toFixed(1)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            PA/G: {(stats.averagePointsAgainst || 0).toFixed(1)}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${
                            (stats.strengthOfSchedule || 0) >= 0 ? 'text-orange-600' : 'text-green-600'
                          }`}>
                            SOS: {(stats.strengthOfSchedule || 0) >= 0 ? '+' : ''}
                            {((stats.strengthOfSchedule || 0) * 100).toFixed(1)}%
                          </Badge>
                          <Badge variant="secondary" className="text-xs font-mono">
                            Power: {(stats.powerRating || 0).toFixed(1)}
                          </Badge>
                        </div>
                      )}

                      {/* Quality Metrics */}
                      {stats.gamesPlayed > 0 && (stats.qualityWins > 0 || stats.badLosses > 0 || stats.blowoutWins > 0) && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {stats.qualityWins > 0 && (
                            <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                              QW: {stats.qualityWins}
                            </Badge>
                          )}
                          {stats.badLosses > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              BL: {stats.badLosses}
                            </Badge>
                          )}
                          {stats.blowoutWins > 0 && (
                            <Badge className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-100">
                              Blowouts: {stats.blowoutWins}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Current Streak */}
                      {stats.currentStreak && stats.currentStreak.type !== 'none' && (
                        <Badge 
                          variant={
                            stats.currentStreak.type === 'win' ? 'default' :
                            stats.currentStreak.type === 'loss' ? 'destructive' : 'secondary'
                          }
                          className="text-xs"
                        >
                          Current Streak: {stats.currentStreak.type.toUpperCase()}{stats.currentStreak.length}
                        </Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                    {isAuthenticated && (
                      <>
                        <Button
                          onClick={() => handleEdit(team)}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
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
                      </>
                    )}
                    </div>
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
              Team Summary
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
                <div className="text-sm text-muted-foreground">Active Games</div>
                <div className="text-2xl font-bold">
                  {powerRankings.filter(r => r.gamesPlayed > 0).length}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Undefeated</div>
                <div className="text-2xl font-bold">
                  {powerRankings.filter(r => r.losses === 0 && r.gamesPlayed > 0).length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeamManager;