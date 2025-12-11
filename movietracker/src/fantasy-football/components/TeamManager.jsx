import React, { useState } from 'react';
import { Users, Plus, Edit3, Trash2, Trophy, Target, TrendingUp } from 'lucide-react';

const TeamManager = ({ 
  teams = [], 
  onAddTeam, 
  onUpdateTeam, 
  onRemoveTeam, 
  loading = false,
  powerRankings = []
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
    if (confirm(`Are you sure you want to remove ${team.name}? This will also remove all their games.`)) {
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

  const getRankColor = (rank) => {
    if (!rank) return 'text-gray-400';
    if (rank === 1) return 'text-yellow-600';
    if (rank <= 3) return 'text-orange-600';
    if (rank <= 6) return 'text-green-600';
    if (rank <= 10) return 'text-blue-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <Users className="text-blue-600" size={28} />
          Team Management
        </h2>
        
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Team
        </button>
      </div>

      {/* Add/Edit Team Form */}
      {showAddForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">
            {editingTeam ? 'Edit Team' : 'Add New Team'}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Team Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Enter team name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Owner (Optional)</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Enter owner name"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : editingTeam ? 'Update Team' : 'Add Team'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teams List */}
      {teams.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users size={64} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Teams Yet</h3>
          <p>Add your first team to get started with power rankings!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map(team => {
            const rank = getTeamRanking(team.id);
            const stats = getTeamStats(team.id);
            
            return (
              <div key={team.id} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold">{team.name}</h3>
                      
                      {rank && (
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${getRankColor(rank)} bg-gray-100`}>
                          <Trophy size={14} />
                          #{rank}
                        </div>
                      )}
                    </div>
                    
                    {team.owner && (
                      <div className="text-gray-600 mb-3">
                        <strong>Owner:</strong> {team.owner}
                      </div>
                    )}

                    {/* Team Stats */}
                    {stats.gamesPlayed > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Target size={16} className="text-blue-600" />
                          <span>
                            <strong>Record:</strong> {stats.wins || 0}-{stats.losses || 0}
                            {stats.ties > 0 && `-${stats.ties}`}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <TrendingUp size={16} className="text-green-600" />
                          <span>
                            <strong>Win%:</strong> {((stats.winPercentage || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                        
                        <div>
                          <strong>Points For:</strong> {(stats.pointsFor || 0).toFixed(1)}
                        </div>
                        
                        <div>
                          <strong>Point Diff:</strong> 
                          <span className={`ml-1 ${(stats.pointDifferential || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(stats.pointDifferential || 0) >= 0 ? '+' : ''}{(stats.pointDifferential || 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Advanced Stats */}
                    {stats.gamesPlayed > 0 && (
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                        <div>
                          <strong>PPG:</strong> {(stats.averagePointsFor || 0).toFixed(1)}
                        </div>
                        <div>
                          <strong>PA/G:</strong> {(stats.averagePointsAgainst || 0).toFixed(1)}
                        </div>
                        <div>
                          <strong>SOS:</strong> 
                          <span className={`ml-1 ${(stats.strengthOfSchedule || 0) >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {(stats.strengthOfSchedule || 0) >= 0 ? '+' : ''}{((stats.strengthOfSchedule || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <strong>Power Rating:</strong> {(stats.powerRating || 0).toFixed(1)}
                        </div>
                      </div>
                    )}

                    {/* Quality Metrics */}
                    {stats.gamesPlayed > 0 && (stats.qualityWins > 0 || stats.badLosses > 0 || stats.blowoutWins > 0) && (
                      <div className="mt-3 flex gap-4 text-xs">
                        {stats.qualityWins > 0 && (
                          <span className="text-green-600">
                            <strong>Quality Wins:</strong> {stats.qualityWins}
                          </span>
                        )}
                        {stats.badLosses > 0 && (
                          <span className="text-red-600">
                            <strong>Bad Losses:</strong> {stats.badLosses}
                          </span>
                        )}
                        {stats.blowoutWins > 0 && (
                          <span className="text-purple-600">
                            <strong>Blowout Wins:</strong> {stats.blowoutWins}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Current Streak */}
                    {stats.currentStreak && stats.currentStreak.type !== 'none' && (
                      <div className="mt-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          stats.currentStreak.type === 'win' ? 'text-green-600 bg-green-100' :
                          stats.currentStreak.type === 'loss' ? 'text-red-600 bg-red-100' :
                          'text-gray-600 bg-gray-100'
                        }`}>
                          Current Streak: {stats.currentStreak.type.toUpperCase()}{stats.currentStreak.length}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(team)}
                      className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit team"
                    >
                      <Edit3 size={16} />
                    </button>
                    
                    <button
                      onClick={() => handleRemove(team)}
                      className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove team"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Stats */}
      {teams.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Team Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Teams:</span>
              <span className="ml-2 font-medium">{teams.length}</span>
            </div>
            <div>
              <span className="text-gray-600">With Owners:</span>
              <span className="ml-2 font-medium">
                {teams.filter(team => team.owner && team.owner.trim()).length}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Active Games:</span>
              <span className="ml-2 font-medium">
                {powerRankings.filter(r => r.gamesPlayed > 0).length}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Undefeated:</span>
              <span className="ml-2 font-medium">
                {powerRankings.filter(r => r.losses === 0 && r.gamesPlayed > 0).length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManager;