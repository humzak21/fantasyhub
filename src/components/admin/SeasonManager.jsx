import React, { useMemo, useState } from 'react';
import { Plus, Edit3, Trash2, Play, Calendar, Users, Trophy, Settings, Download, Upload, AlertTriangle, Flag } from 'lucide-react';

/** How `copyFrom` below maps onto the data layer's `copyTeamsFromSeasonId`. */
const COPY_PREVIOUS = 'previous';
const COPY_NONE = 'none';

/**
 * What to tell the admin after a create. The team copy is deliberately
 * non-fatal in the data layer — the season exists either way — so a failed
 * copy has to be reported here rather than swallowed.
 */
const describeCreatedSeason = (season, year) => {
  if (season?.teamCopyError) {
    return {
      type: 'warning',
      text: `Created the ${year} season, but its teams could not be copied over: ${season.teamCopyError}. Add them manually, or delete the season and try again.`
    };
  }

  if (season?.teamsCopiedFrom) {
    const count = season.teams?.length ?? 0;
    return {
      type: 'success',
      text: `Created the ${year} season with ${count} teams carried over from ${season.teamsCopiedFrom.year}. Records and rosters start empty.`
    };
  }

  return {
    type: 'success',
    text: `Created the ${year} season with no teams. Add them here or import them from ESPN.`
  };
};

/** The Tuesday a season starts is week 1 for every date the app derives. */
const emptyForm = (year) => ({
  year,
  name: '',
  leagueSize: 14,
  regularSeasonWeeks: 14,
  playoffWeeks: 3,
  startDate: ''
});

const SeasonManager = ({
  seasons = [],
  activeSeason,
  onCreateSeason,
  onSetActiveSeason,
  onDeleteSeason,
  onFinalizeSeason,
  onExportSeason,
  onImportSeason,
  loading = false,
  isAuthenticated = false // This now represents isAdmin from parent
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [formData, setFormData] = useState(() => emptyForm(new Date().getFullYear()));
  const [importData, setImportData] = useState('');
  // The dry run being shown for confirmation: { season, assignments }.
  const [pendingFinalize, setPendingFinalize] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  // 'previous' | 'none' | a season id. The league is the same owners every
  // year, so carrying last season forward is the default.
  const [copyFrom, setCopyFrom] = useState(COPY_PREVIOUS);
  const [notice, setNotice] = useState(null);

  /** What 'previous' resolves to, so the form can name it before submitting. */
  const previousSeason = useMemo(() => {
    return seasons
      .filter(season => season.year < formData.year)
      .sort((a, b) => b.year - a.year)[0] ?? null;
  }, [seasons, formData.year]);

  const copySource = copyFrom === COPY_PREVIOUS
    ? previousSeason
    : seasons.find(season => season.id === copyFrom) ?? null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // undefined lets the data layer pick the previous season itself; null
      // means an empty season.
      const copyTeamsFromSeasonId =
        copyFrom === COPY_PREVIOUS ? undefined : copyFrom === COPY_NONE ? null : copyFrom;

      const season = await onCreateSeason(
        formData.year,
        formData.name,
        formData.leagueSize,
        formData.regularSeasonWeeks,
        formData.playoffWeeks,
        copyTeamsFromSeasonId,
        formData.startDate || null
      );
      setShowCreateForm(false);
      setNotice(describeCreatedSeason(season, formData.year));
      setFormData(emptyForm(new Date().getFullYear() + 1));
      setCopyFrom(COPY_PREVIOUS);
    } catch (error) {
      alert('Error creating season: ' + error.message);
    }
  };

  /**
   * Finalizing is two calls: a dry run whose assignments the admin confirms,
   * then the real one. The podium is derived from games, not entered by hand,
   * so seeing it before it is written is the only review there is.
   */
  const handleFinalizePreview = async (season) => {
    setFinalizing(true);
    try {
      const preview = await onFinalizeSeason(season.id, { dryRun: true });
      setPendingFinalize({ season, assignments: preview?.assignments ?? [] });
    } catch (error) {
      setNotice({
        type: 'warning',
        text: `Could not work out the ${season.year} final standings: ${error.message}`
      });
    } finally {
      setFinalizing(false);
    }
  };

  const handleFinalizeConfirm = async () => {
    const { season } = pendingFinalize;
    setFinalizing(true);
    try {
      await onFinalizeSeason(season.id, { dryRun: false });
      setPendingFinalize(null);
      setNotice({
        type: 'success',
        text: `${season.year} is finalized. Its standings, awards and League History are up to date.`
      });
    } catch (error) {
      setNotice({ type: 'warning', text: `Could not finalize ${season.year}: ${error.message}` });
    } finally {
      setFinalizing(false);
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

  const handleExport = async (season) => {
    try {
      // `onExportSeason` is async. Without the await this stringified a pending
      // Promise, so every export downloaded the two bytes `{}`.
      const data = await onExportSeason(season.id);
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
        {isAuthenticated && (
          <div className="flex gap-2">
            {/* Season import has no implementation; the shell passes null. */}
            {onImportSeason && (
              <button
                onClick={() => setShowImportForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Upload size={16} />
                Import
              </button>
            )}
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              New Season
            </button>
          </div>
        )}
      </div>

      {/* Outcome of the last create, including a copy that did not happen */}
      {notice && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-4 ${
            notice.type === 'warning'
              ? 'border-yellow-200 bg-yellow-50 text-yellow-900'
              : 'border-green-200 bg-green-50 text-green-900'
          }`}
        >
          {notice.type === 'warning' && <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
          <p className="text-sm flex-1">{notice.text}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-sm underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

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
                <label className="block text-sm font-medium mb-1">Week 1 start date (Tuesday)</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Every date the app derives — the current week, pick&apos;em windows, the
                  weekly sync — counts from here. Without it the season has no week 1.
                </p>
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
              
              <div>
                <label className="block text-sm font-medium mb-1">Teams</label>
                <select
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value={COPY_PREVIOUS}>
                    {previousSeason
                      ? `Carry over from ${previousSeason.year} (previous season)`
                      : 'Carry over from the previous season'}
                  </option>
                  {seasons
                    .filter(season => season.id !== previousSeason?.id)
                    .map(season => (
                      <option key={season.id} value={season.id}>
                        Carry over from {season.year}
                      </option>
                    ))}
                  <option value={COPY_NONE}>Start empty (add teams manually)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {copyFrom === COPY_NONE
                    ? 'No teams or divisions will be created.'
                    : copySource
                      ? `Copies ${copySource.teams?.length ?? 0} teams and their divisions from ${copySource.year}. Names, owners and ESPN ids carry over; records, rosters and rankings start empty.`
                      : 'No earlier season to copy from — this season will start empty.'}
                </p>
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

      {/* Finalize confirmation: the derived podium, before it is written */}
      {pendingFinalize && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">Finalize {pendingFinalize.season.year}?</h3>
            <p className="text-sm text-gray-600 mb-4">
              These placements were derived from the season&apos;s games. Applying them marks
              the season completed, computes its awards, and publishes it to League History.
            </p>

            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1 pr-2 font-medium">#</th>
                  <th className="py-1 pr-2 font-medium">Owner</th>
                  <th className="py-1 pr-2 font-medium">Record</th>
                  <th className="py-1 pr-2 font-medium">Seed</th>
                  <th className="py-1 font-medium">Finish</th>
                </tr>
              </thead>
              <tbody>
                {pendingFinalize.assignments.map(row => (
                  <tr key={row.team_id} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-semibold">{row.final_rank}</td>
                    <td className="py-1 pr-2">{row.owner}</td>
                    <td className="py-1 pr-2 font-mono text-xs">{row.record}</td>
                    <td className="py-1 pr-2">{row.seed}</td>
                    <td className="py-1">{row.finish === 'none' ? '—' : row.finish}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingFinalize(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalizeConfirm}
                disabled={finalizing}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {finalizing ? 'Finalizing...' : 'Apply'}
              </button>
            </div>
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
                    {isAuthenticated && !season.isActive && (
                      <button
                        onClick={() => onSetActiveSeason(season.id)}
                        className="flex items-center gap-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        title="Set as active season"
                      >
                        <Play size={16} />
                        Activate
                      </button>
                    )}

                    {/* Activating the next season finalizes this one already;
                        this is for a season that was switched away from before
                        finalizing existed, or one that failed to finalize. */}
                    {isAuthenticated && onFinalizeSeason && !season.isActive && !season.isCompleted && (
                      <button
                        onClick={() => handleFinalizePreview(season)}
                        disabled={finalizing}
                        className="flex items-center gap-1 px-3 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
                        title="Derive the final standings and awards from this season's games"
                      >
                        <Flag size={16} />
                        Finalize
                      </button>
                    )}

                    <button
                      onClick={() => handleExport(season)}
                      className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Export season data"
                    >
                      <Download size={16} />
                    </button>
                    
                    {isAuthenticated && (
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
                    )}
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