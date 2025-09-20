import React, { useState } from 'react';
import { Users, Plus, Edit3, Trash2, Trophy, Target, TrendingUp, Crown, Medal, Award, X, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import MobileButton from './MobileButton';
import { MobileForm } from './MobileForm';
import { MobileInput } from './MobileInput';
import { MobileFormField, MobileFormSection, MobileFormActions } from './MobileFormValidation';

const MobileTeamManager = ({ 
  teams = [], 
  onAddTeam, 
  onUpdateTeam, 
  onRemoveTeam, 
  loading = false,
  powerRankings = [],
  isAuthenticated = false
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
      }
      
      setShowAddForm(false);
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
    if (confirm(`Are you sure you want to remove ${team.name}? This will also remove all their games and cannot be undone.`)) {
      try {
        await onRemoveTeam(team.id);
      } catch (error) {
        alert('Error removing team: ' + error.message);
      }
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

  const getRankBadgeColor = (rank) => {
    if (!rank) return 'bg-gray-100 text-gray-700';
    if (rank === 1) return 'bg-yellow-100 text-yellow-800';
    if (rank <= 3) return 'bg-blue-100 text-blue-800';
    if (rank <= 6) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-700';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown className="h-3 w-3" />;
    if (rank <= 3) return <Medal className="h-3 w-3" />;
    if (rank <= 6) return <Award className="h-3 w-3" />;
    return <Trophy className="h-3 w-3" />;
  };

  const teamsWithOwners = teams.filter(team => team.owner && team.owner.trim()).length;
  const activeTeams = powerRankings.filter(r => r.gamesPlayed > 0).length;
  const undefeatedTeams = powerRankings.filter(r => r.losses === 0 && r.gamesPlayed > 0).length;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Team Management</h2>
            <p className="text-sm text-gray-600">Manage your fantasy teams</p>
          </div>
        </div>
        
        {isAuthenticated && (
          <MobileButton onClick={() => setShowAddForm(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Team
          </MobileButton>
        )}
      </div>

      {/* Add/Edit Team Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center p-0 z-50">
          <div className="bg-white rounded-t-xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {editingTeam ? 'Edit Team' : 'Add New Team'}
              </h3>
              <button
                onClick={handleCancelEdit}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <MobileForm onSubmit={handleSubmit}>
                <MobileFormSection>
                  <MobileFormField label="Team Name" required>
                    <MobileInput
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter team name"
                      autoFocus
                    />
                  </MobileFormField>

                  <MobileFormField 
                    label="Owner" 
                    hint="Optional - Enter the team owner's name"
                  >
                    <MobileInput
                      value={formData.owner}
                      onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                      placeholder="Enter owner name"
                    />
                  </MobileFormField>
                </MobileFormSection>

                <MobileFormActions layout="horizontal">
                  <MobileButton
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="flex-1"
                  >
                    Cancel
                  </MobileButton>
                  <MobileButton
                    type="submit"
                    loading={loading}
                    className="flex-1"
                  >
                    {editingTeam ? 'Update Team' : 'Add Team'}
                  </MobileButton>
                </MobileFormActions>
              </MobileForm>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {teams.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-blue-600 text-sm font-medium">Total Teams</div>
            <div className="text-2xl font-bold text-blue-900">{teams.length}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-green-600 text-sm font-medium">With Owners</div>
            <div className="text-2xl font-bold text-green-900">{teamsWithOwners}</div>
          </div>
        </div>
      )}

      {/* Teams List */}
      {teams.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium mb-2 text-gray-900">No Teams Yet</h3>
          <p className="text-gray-600 mb-6">Add your first team to get started with power rankings!</p>
          {isAuthenticated && (
            <MobileButton onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Team
            </MobileButton>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => {
            const rank = getTeamRanking(team.id);
            const stats = getTeamStats(team.id);
            
            return (
              <div key={team.id} className="bg-white rounded-lg border border-gray-200 p-4">
                {/* Team Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold">{team.name}</h3>
                      {rank && (
                        <span className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
                          getRankBadgeColor(rank)
                        )}>
                          {getRankIcon(rank)}
                          #{rank}
                        </span>
                      )}
                    </div>
                    
                    {team.owner && (
                      <div className="text-sm text-gray-600 mb-2">
                        <strong>Owner:</strong> {team.owner}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {isAuthenticated && (
                    <div className="flex gap-2 ml-2">
                      <MobileButton
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(team)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </MobileButton>
                      <MobileButton
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(team)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </MobileButton>
                    </div>
                  )}
                </div>

                {/* Team Stats */}
                {stats.gamesPlayed > 0 && (
                  <>
                    {/* Basic Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Target className="h-3 w-3" />
                          <span className="text-xs">Record</span>
                        </div>
                        <div className="font-semibold">
                          {stats.wins || 0}-{stats.losses || 0}
                          {stats.ties > 0 && `-${stats.ties}`}
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-gray-600">
                          <TrendingUp className="h-3 w-3" />
                          <span className="text-xs">Win%</span>
                        </div>
                        <div className="font-semibold">
                          {((stats.winPercentage || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Points Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="space-y-1">
                        <div className="text-xs text-gray-600">Points For</div>
                        <div className="font-semibold">{(stats.pointsFor || 0).toFixed(1)}</div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-xs text-gray-600">Point Diff</div>
                        <div className={cn(
                          'font-semibold',
                          (stats.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {(stats.pointDifferential || 0) >= 0 ? '+' : ''}
                          {(stats.pointDifferential || 0).toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* Advanced Stats Badges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        PPG: {(stats.averagePointsFor || 0).toFixed(1)}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        PA/G: {(stats.averagePointsAgainst || 0).toFixed(1)}
                      </span>
                      <span className={cn(
                        'px-2 py-1 text-xs rounded',
                        (stats.strengthOfSchedule || 0) >= 0 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-green-100 text-green-700'
                      )}>
                        SOS: {(stats.strengthOfSchedule || 0) >= 0 ? '+' : ''}
                        {((stats.strengthOfSchedule || 0) * 100).toFixed(1)}%
                      </span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-mono">
                        Power: {(stats.powerRating || 0).toFixed(1)}
                      </span>
                    </div>

                    {/* Quality Metrics */}
                    {(stats.qualityWins > 0 || stats.badLosses > 0 || stats.blowoutWins > 0) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {stats.qualityWins > 0 && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                            Quality Wins: {stats.qualityWins}
                          </span>
                        )}
                        {stats.badLosses > 0 && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                            Bad Losses: {stats.badLosses}
                          </span>
                        )}
                        {stats.blowoutWins > 0 && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                            Blowouts: {stats.blowoutWins}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Current Streak */}
                    {stats.currentStreak && stats.currentStreak.type !== 'none' && (
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'px-2 py-1 text-xs rounded font-medium',
                          stats.currentStreak.type === 'win' 
                            ? 'bg-green-100 text-green-700' 
                            : stats.currentStreak.type === 'loss'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                        )}>
                          Current Streak: {stats.currentStreak.type.toUpperCase()}{stats.currentStreak.length}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* No Stats Message */}
                {stats.gamesPlayed === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No games played yet
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Additional Stats */}
      {teams.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            League Summary
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-sm text-gray-600">Active Teams</div>
              <div className="text-lg font-bold">{activeTeams}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-gray-600">Undefeated</div>
              <div className="text-lg font-bold">{undefeatedTeams}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileTeamManager;