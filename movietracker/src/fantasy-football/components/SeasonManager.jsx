import React, { useState } from 'react';
import { Plus, Edit3, Trash2, Play, Calendar, Users, Trophy, Settings, Download, Upload } from 'lucide-react';

const SeasonManager = ({ 
  seasons = [], 
  activeSeason, 
  onCreateSeason, 
  onSetActiveSeason, 
  onDeleteSeason,
  onExportSeason,
  onImportSeason,
  loading = false 
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    name: '',
    leagueSize: 14,
    regularSeasonWeeks: 14,
    playoffWeeks: 3
  });
  const [importData, setImportData] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onCreateSeason(
        formData.year,
        formData.name,
        formData.leagueSize,
        formData.regularSeasonWeeks,
        formData.playoffWeeks
      );
      setShowCreateForm(false);
      setFormData({
        year: new Date().getFullYear() + 1,
        name: '',
        leagueSize: 14,
        regularSeasonWeeks: 14,
        playoffWeeks: 3
      });
    } catch (error) {
      alert('Error creating season: ' + error.message);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse(importData);
      await onImportSeason(data);
      setShowImportForm(false);
      setImportData('');
    } catch (error) {
      alert('Error importing season: ' + error.message);
    }
  };

  const handleExport = (season) => {
    try {
      const data = onExportSeason(season.id);
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fantasy-football-${season.year}-export.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error exporting season: ' + error.message);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getSeasonStatus = (season) => {
    if (season.isCompleted) return { text: 'Completed', color: 'text-gray-600 bg-gray-100' };
    if (season.isActive) return { text: 'Active', color: 'text-green-600 bg-green-100' };
    return { text: 'Inactive', color: 'text-yellow-600 bg-yellow-100' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <Settings className="text-blue-600" size={28} />
          Season Management
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Upload size={16} />
            Import
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Season
          </button>
        </div>
      </div>

      {/* Create Season Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Create New Season</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Year</label>
                <input
                  type="number"
                  min="2020"
                  max="2040"
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Season Name (Optional)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                  placeholder="e.g., 'Championship Season'"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">League Size</label>
                  <input
                    type="number"
                    min="4"
                    max="20"
                    value={formData.leagueSize}
                    onChange={(e) => setFormData(prev => ({ ...prev, leagueSize: parseInt(e.target.value) }))}
                    className="w-full p-2 border rounded-lg"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Regular Weeks</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formData.regularSeasonWeeks}
                    onChange={(e) => setFormData(prev => ({ ...prev, regularSeasonWeeks: parseInt(e.target.value) }))}
                    className="w-full p-2 border rounded-lg"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Playoff Weeks</label>
                  <input
                    type="number"
                    min="0"
                    max="6"
                    value={formData.playoffWeeks}
                    onChange={(e) => setFormData(prev => ({ ...prev, playoffWeeks: parseInt(e.target.value) }))}
                    className="w-full p-2 border rounded-lg"
                    required
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Season'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Season Form */}
      {showImportForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Import Season</h3>
            <form onSubmit={handleImport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Season Data (JSON)</label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  className="w-full p-2 border rounded-lg h-32"
                  placeholder="Paste exported season JSON data here..."
                  required
                />
              </div>
              
              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowImportForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Importing...' : 'Import Season'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seasons List */}
      {seasons.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Trophy size={64} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Seasons Yet</h3>
          <p>Create your first season to start tracking power rankings!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {seasons.map(season => {
            const status = getSeasonStatus(season);
            return (
              <div key={season.id} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold">
                        {season.name || `${season.year} Season`}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {status.text}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} />
                        <span>Year: {season.year}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users size={16} />
                        <span>{season.teams.length}/{season.leagueSize} Teams</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Trophy size={16} />
                        <span>{season.regularSeasonWeeks}+{season.playoffWeeks} Weeks</span>
                      </div>
                      <div>
                        <span>Created: {formatDate(season.createdAt)}</span>
                      </div>
                    </div>

                    {season.teams.length > 0 && (
                      <div className="text-sm text-gray-600">
                        <strong>Teams:</strong> {season.teams.map(team => team.name).join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {!season.isActive && (
                      <button
                        onClick={() => onSetActiveSeason(season.id)}
                        className="flex items-center gap-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        title="Set as active season"
                      >
                        <Play size={16} />
                        Activate
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleExport(season)}
                      className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Export season data"
                    >
                      <Download size={16} />
                    </button>
                    
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete the ${season.year} season? This action cannot be undone.`)) {
                          onDeleteSeason(season.id);
                        }
                      }}
                      className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete season"
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

      {/* Active Season Info */}
      {activeSeason && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-2">Active Season</h4>
          <p className="text-green-800">
            Currently managing: <strong>{activeSeason.name || `${activeSeason.year} Season`}</strong>
            {activeSeason.teams.length > 0 && (
              <span> with {activeSeason.teams.length} teams</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default SeasonManager;