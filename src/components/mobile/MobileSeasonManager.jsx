import React, { useState } from 'react';
import { Plus, Edit3, Trash2, Play, Calendar, Users, Trophy, Settings, Download, Upload, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import MobileButton from './MobileButton';
import { MobileForm, MobileSelect, MobileNumberInput } from './MobileForm';
import { MobileInput, MobileTextarea } from './MobileInput';
import { MobileFormField, MobileFormSection, MobileFormActions } from './MobileFormValidation';

const MobileSeasonManager = ({ 
  seasons = [], 
  activeSeason, 
  onCreateSeason, 
  onSetActiveSeason, 
  onDeleteSeason,
  onExportSeason,
  onImportSeason,
  loading = false,
  isAuthenticated = false
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
    if (season.isCompleted) return { text: 'Completed', color: 'bg-gray-100 text-gray-700' };
    if (season.isActive) return { text: 'Active', color: 'bg-green-100 text-green-700' };
    return { text: 'Inactive', color: 'bg-yellow-100 text-yellow-700' };
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Settings className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Season Management</h2>
            <p className="text-sm text-gray-600">Manage your fantasy seasons</p>
          </div>
        </div>
        
        {isAuthenticated && (
          <div className="flex gap-3">
            <MobileButton
              variant="outline"
              size="sm"
              onClick={() => setShowImportForm(true)}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </MobileButton>
            <MobileButton
              size="sm"
              onClick={() => setShowCreateForm(true)}
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Season
            </MobileButton>
          </div>
        )}
      </div>

      {/* Create Season Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center p-0 z-50">
          <div className="bg-white rounded-t-xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Create New Season</h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <MobileForm onSubmit={handleSubmit}>
                <MobileFormSection>
                  <MobileFormField label="Year" required>
                    <MobileNumberInput
                      value={formData.year.toString()}
                      onChange={(value) => setFormData(prev => ({ ...prev, year: parseInt(value) || new Date().getFullYear() }))}
                      min={2020}
                      max={2040}
                      showSteppers={true}
                    />
                  </MobileFormField>

                  <MobileFormField 
                    label="Season Name" 
                    hint="Optional custom name for this season"
                  >
                    <MobileInput
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., 'Championship Season'"
                    />
                  </MobileFormField>

                  <MobileFormField label="League Size" required>
                    <MobileNumberInput
                      value={formData.leagueSize.toString()}
                      onChange={(value) => setFormData(prev => ({ ...prev, leagueSize: parseInt(value) || 14 }))}
                      min={4}
                      max={20}
                      showSteppers={true}
                    />
                  </MobileFormField>

                  <div className="grid grid-cols-2 gap-4">
                    <MobileFormField label="Regular Weeks" required>
                      <MobileNumberInput
                        value={formData.regularSeasonWeeks.toString()}
                        onChange={(value) => setFormData(prev => ({ ...prev, regularSeasonWeeks: parseInt(value) || 14 }))}
                        min={1}
                        max={20}
                        showSteppers={true}
                      />
                    </MobileFormField>

                    <MobileFormField label="Playoff Weeks" required>
                      <MobileNumberInput
                        value={formData.playoffWeeks.toString()}
                        onChange={(value) => setFormData(prev => ({ ...prev, playoffWeeks: parseInt(value) || 3 }))}
                        min={0}
                        max={6}
                        showSteppers={true}
                      />
                    </MobileFormField>
                  </div>
                </MobileFormSection>

                <MobileFormActions layout="horizontal">
                  <MobileButton
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </MobileButton>
                  <MobileButton
                    type="submit"
                    loading={loading}
                    className="flex-1"
                  >
                    Create Season
                  </MobileButton>
                </MobileFormActions>
              </MobileForm>
            </div>
          </div>
        </div>
      )}

      {/* Import Season Modal */}
      {showImportForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center p-0 z-50">
          <div className="bg-white rounded-t-xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Import Season</h3>
              <button
                onClick={() => setShowImportForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <MobileForm onSubmit={handleImport}>
                <MobileFormSection>
                  <MobileFormField 
                    label="Season Data (JSON)" 
                    hint="Paste the exported season JSON data here"
                    required
                  >
                    <MobileTextarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="Paste exported season JSON data here..."
                      rows={8}
                      autoResize={true}
                    />
                  </MobileFormField>
                </MobileFormSection>

                <MobileFormActions layout="horizontal">
                  <MobileButton
                    type="button"
                    variant="outline"
                    onClick={() => setShowImportForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </MobileButton>
                  <MobileButton
                    type="submit"
                    loading={loading}
                    className="flex-1"
                  >
                    Import Season
                  </MobileButton>
                </MobileFormActions>
              </MobileForm>
            </div>
          </div>
        </div>
      )}

      {/* Seasons List */}
      {seasons.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium mb-2 text-gray-900">No Seasons Yet</h3>
          <p className="text-gray-600 mb-6">Create your first season to start tracking power rankings!</p>
          {isAuthenticated && (
            <MobileButton onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Season
            </MobileButton>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {seasons.map(season => {
            const status = getSeasonStatus(season);
            return (
              <div key={season.id} className="bg-white rounded-lg border border-gray-200 p-4">
                {/* Season Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold">
                        {season.name || `${season.year} Season`}
                      </h3>
                      <span className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        status.color
                      )}>
                        {status.text}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Season Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Year: {season.year}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>{season.teams.length}/{season.leagueSize} Teams</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Trophy className="h-4 w-4" />
                    <span>{season.regularSeasonWeeks}+{season.playoffWeeks} Weeks</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span>Created: {formatDate(season.createdAt)}</span>
                  </div>
                </div>

                {/* Teams List */}
                {season.teams.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Teams:</div>
                    <div className="flex flex-wrap gap-1">
                      {season.teams.slice(0, 3).map(team => (
                        <span key={team.id} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {team.name}
                        </span>
                      ))}
                      {season.teams.length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          +{season.teams.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {isAuthenticated && !season.isActive && (
                    <MobileButton
                      size="sm"
                      variant="secondary"
                      onClick={() => onSetActiveSeason(season.id)}
                      className="flex-1"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Activate
                    </MobileButton>
                  )}
                  
                  <MobileButton
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(season)}
                    className={isAuthenticated && !season.isActive ? "flex-1" : "flex-1"}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </MobileButton>
                  
                  {isAuthenticated && (
                    <MobileButton
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete the ${season.year} season? This action cannot be undone.`)) {
                          onDeleteSeason(season.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </MobileButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Season Info */}
      {activeSeason && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Active Season
          </h4>
          <p className="text-green-800 text-sm">
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

export default MobileSeasonManager;