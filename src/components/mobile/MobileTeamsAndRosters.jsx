import React, { useState } from 'react';
import { Users, Plus, Edit3, Trash2, Trophy, Crown, Medal, Award, User, Target, TrendingUp, X, Save, AlertCircle } from 'lucide-react';
import MobileButton from './MobileButton';
import MobileInput from './MobileInput';
import { cn } from '../../../lib/utils';

const MobileTeamsAndRosters = ({ 
  teams = [], 
  rosters = {},
  onAddTeam, 
  onUpdateTeam, 
  onRemoveTeam, 
  loading = false,
  powerRankings = [],
  isAuthenticated = false
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
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
    if (confirm(`Remove ${team.name}? This will also remove all their games and cannot be undone.`)) {
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
    if (!rank) return 'bg-gray-100 text-gray-600';
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (rank <= 3) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (rank <= 6) return 'bg-green-100 text-green-800 border-green-300';
    return 'bg-gray-100 text-gray-600 border-gray-300';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown size={12} />;
    if (rank <= 3) return <Medal size={12} />;
    if (rank <= 6) return <Award size={12} />;
    return <Trophy size={12} />;
  };


  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/10 rounded-lg flex items-center justify-center">
              <Users className="text-blue-600" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Teams & Rosters</h1>
              <p className="text-sm text-gray-500">Manage teams and view player rosters</p>
            </div>
          </div>

          {isAuthenticated && (
            <MobileButton
              variant="default"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={16} />
              Add Team
            </MobileButton>
          )}
        </div>
      </div>

      {/* Add/Edit Team Form */}
      {showAddForm && (
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingTeam ? 'Edit Team' : 'Add New Team'}
            </h2>
            <p className="text-sm text-gray-500">
              {editingTeam ? 'Update team information' : 'Create a new team for your league'}
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Team Name *
              </label>
              <MobileInput
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter team name"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Owner (Optional)
              </label>
              <MobileInput
                type="text"
                value={formData.owner}
                onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                placeholder="Enter owner name"
              />
            </div>
            
            <div className="flex gap-3">
              <MobileButton
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleCancelEdit}
              >
                <X size={16} />
                Cancel
              </MobileButton>
              <MobileButton
                type="submit"
                variant="default"
                className="flex-1"
                loading={loading}
              >
                <Save size={16} />
                {editingTeam ? 'Update' : 'Add Team'}
              </MobileButton>
            </div>
          </form>
        </div>
      )}

      {/* Teams List */}
      <div className="flex-1 overflow-y-auto">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Users size={64} className="text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Teams Yet</h3>
            <p className="text-gray-500 mb-6">Add your first team to get started with power rankings!</p>
            {isAuthenticated && (
              <MobileButton
                variant="default"
                onClick={() => setShowAddForm(true)}
              >
                <Plus size={16} />
                Add First Team
              </MobileButton>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {teams.map((team, teamIndex) => {
              const rank = getTeamRanking(team.id);
              const stats = getTeamStats(team.id);
              const teamRoster = rosters[team.id]?.roster || [];

              const handleTeamSelect = () => {
                console.log('Selected team:', team.name, team.id);
                setSelectedTeam(team);
              };

              const handleTeamEdit = () => {
                handleEdit(team);
              };

              const handleTeamDelete = () => {
                handleRemove(team);
              };

              return (
                <MobileTeamCard
                  key={`team-${team.id}-${teamIndex}`}
                  team={team}
                  rank={rank}
                  stats={stats}
                  rosterCount={teamRoster.length}
                  roster={teamRoster}
                  onEdit={handleTeamEdit}
                  onDelete={handleTeamDelete}
                  isAuthenticated={isAuthenticated}
                  rosters={rosters}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* League Summary Footer - Enhanced like desktop */}
      {teams.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="text-blue-600" size={18} />
              <h3 className="text-lg font-semibold text-gray-900">League Summary</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{teams.length}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total Teams</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {teams.filter(team => team.owner && team.owner.trim()).length}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">With Owners</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {powerRankings.filter(r => r.gamesPlayed > 0).length}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Active Teams</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {teams.filter(team => rosters[team.id]?.roster?.length > 0).length}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">With Rosters</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact Player List Component
const CompactPlayerList = ({ roster }) => {
  if (!roster || roster.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic">No roster data</div>
    );
  }

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

  // Group players by position for better organization
  const groupedPlayers = roster.reduce((acc, player) => {
    const position = player.position || player.player?.position || 'UNK';
    if (!acc[position]) {
      acc[position] = [];
    }
    acc[position].push(player);
    return acc;
  }, {});

  const positionOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
  const sortedPositions = positionOrder.filter(pos => groupedPlayers[pos]);
  const otherPositions = Object.keys(groupedPlayers).filter(pos => !positionOrder.includes(pos));
  const allPositions = [...sortedPositions, ...otherPositions];

  return (
    <div className="h-full overflow-y-auto space-y-2">
      {allPositions.map(position => (
        <div key={position}>
          <div className="text-xs font-medium text-gray-600 mb-1">{position}:</div>
          <div className="space-y-1 ml-2">
            {groupedPlayers[position].map((player, idx) => {
              const playerName = player.playerName || player.player?.name || 'Unknown';
              const shortName = playerName.length > 25 ?
                playerName.substring(0, 22) + '...' : playerName;

              return (
                <div
                  key={`${position}-${idx}`}
                  className={`text-xs px-2 py-1.5 rounded border ${getPositionColor(position)}`}
                  title={playerName}
                >
                  {shortName}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// Mobile Team Card Component
const MobileTeamCard = ({
  team,
  rank,
  stats,
  rosterCount,
  roster,
  onEdit,
  onDelete,
  isAuthenticated,
  rosters
}) => {
  const getRankBadgeColor = (rank) => {
    if (!rank) return 'bg-gray-100 text-gray-600';
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (rank <= 3) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (rank <= 6) return 'bg-green-100 text-green-800 border-green-300';
    return 'bg-gray-100 text-gray-600 border-gray-300';
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown size={12} />;
    if (rank <= 3) return <Medal size={12} />;
    if (rank <= 6) return <Award size={12} />;
    return <Trophy size={12} />;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm h-[815px] flex flex-col">
      <div className="p-4 flex flex-col h-full">
        {/* Team Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-gray-900 truncate">{team.name}</h3>
              {rank && (
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border',
                  getRankBadgeColor(rank)
                )}>
                  {getRankIcon(rank)}
                  #{rank}
                </div>
              )}
            </div>
            
            {team.owner && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <User size={14} />
                <span className="truncate">{team.owner}</span>
              </div>
            )}
          </div>
        </div>

        {/* Team Stats - Structured like desktop */}
        {stats.gamesPlayed > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1 text-gray-500 mb-1">
              <span className="text-xs font-medium">Record</span>
            </div>
            <div className={cn(
              'font-bold text-lg mb-3',
              (stats.wins || 0) > (stats.losses || 0) ? 'text-green-600' :
              (stats.wins || 0) < (stats.losses || 0) ? 'text-red-600' : 'text-gray-600'
            )}>
              {stats.wins || 0}-{stats.losses || 0}
              {stats.ties > 0 && `-${stats.ties}`}
            </div>
          </div>
        )}

        {/* Compact Player List */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500">Roster ({rosterCount} players)</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <CompactPlayerList roster={roster} />
          </div>
        </div>


        {/* Admin Actions */}
        {isAuthenticated && (
          <div className="flex gap-2 relative z-10 mt-3 flex-shrink-0">
            <MobileButton
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Edit3 size={14} />
              Edit
            </MobileButton>
            <MobileButton
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={14} />
            </MobileButton>
          </div>
        )}
      </div>
    </div>
  );
};


export default MobileTeamsAndRosters;