import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { useSupabaseFantasyData } from '../hooks/useSupabaseFantasyData';

const ScheduleImportManager = () => {
  const {
    dataManager,
    initialized,
    getPendingScheduleImports,
    getScheduleImportDetails,
    assignScheduleToSeason,
    rejectScheduleImport,
    seasons
  } = useSupabaseFantasyData();
  const [pendingImports, setPendingImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImport, setSelectedImport] = useState(null);
  const [importDetails, setImportDetails] = useState(null);
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');

  useEffect(() => {
    if (initialized) {
      loadData();
    }
  }, [initialized]);

  const loadData = async () => {
    if (!initialized || !dataManager) {
      return;
    }

    try {
      setLoading(true);

      const importsData = await getPendingScheduleImports();

      setPendingImports(importsData || []);
    } catch (error) {
      // Error handling can be added here if needed
    } finally {
      setLoading(false);
    }
  };

  const loadImportDetails = async (importId) => {
    try {
      const details = await getScheduleImportDetails(importId);
      setImportDetails(details);
      setSelectedImport(importId);
    } catch (error) {
      // Error handling can be added here if needed
    }
  };

  const assignToSeason = async (importId, seasonId) => {
    try {
      const result = await assignScheduleToSeason(importId, seasonId, assignmentNotes);
      
      if (result.success) {
        // Refresh the pending imports list
        await loadData();
        setSelectedImport(null);
        setImportDetails(null);
        setAssignmentNotes('');
        alert('Schedule successfully assigned to season!');
      } else {
        alert(`Assignment failed: ${result.error}`);
      }
    } catch (error) {
      alert('Error assigning schedule to season');
    }
  };

  const rejectImport = async (importId) => {
    try {
      await rejectScheduleImport(importId, assignmentNotes);
      await loadData();
      setSelectedImport(null);
      setImportDetails(null);
      setAssignmentNotes('');
      alert('Schedule import rejected');
    } catch (error) {
      alert('Error rejecting schedule import');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule Import Manager</CardTitle>
          <CardDescription>Loading pending schedule imports...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Import Manager</CardTitle>
          <CardDescription>
            Manage ESPN schedule imports and assign them to seasons
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingImports.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No pending schedule imports</p>
              <p className="text-sm mt-2">
                Run the ESPN schedule fetcher to import new schedules
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingImports.map((importItem) => (
                <Card key={importItem.import_id} className="border-l-4 border-l-yellow-400">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">
                            {importItem.league_name || 'Unnamed League'}
                          </h3>
                          <Badge variant="outline">{importItem.season_year}</Badge>
                          <Badge variant="secondary">{importItem.assignment_status}</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">ESPN League ID:</span>
                            <br />
                            {importItem.espn_league_id}
                          </div>
                          <div>
                            <span className="font-medium">Teams:</span>
                            <br />
                            {importItem.team_count}
                          </div>
                          <div>
                            <span className="font-medium">Matchups:</span>
                            <br />
                            {importItem.total_matchups}
                          </div>
                          <div>
                            <span className="font-medium">Imported:</span>
                            <br />
                            {formatDate(importItem.imported_at)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadImportDetails(importItem.import_id)}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Details Modal */}
      {selectedImport && importDetails && (
        <Card>
          <CardHeader>
            <CardTitle>Import Details</CardTitle>
            <CardDescription>
              {importDetails.import.league_name} - {importDetails.import.season_year}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Teams Preview */}
            <div>
              <h4 className="font-semibold mb-3">Teams ({importDetails.teams.length})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {importDetails.teams.map((team) => (
                  <div key={team.id} className="p-2 bg-gray-50 rounded text-sm">
                    <div className="font-medium">{team.team_name}</div>
                    {team.abbreviation && (
                      <div className="text-gray-600">{team.abbreviation}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Matchups Summary */}
            <div>
              <h4 className="font-semibold mb-3">Schedule Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-blue-50 rounded">
                  <div className="font-medium text-blue-800">Total Matchups</div>
                  <div className="text-xl font-bold text-blue-600">
                    {importDetails.matchups.length}
                  </div>
                </div>
                <div className="p-3 bg-green-50 rounded">
                  <div className="font-medium text-green-800">Regular Season</div>
                  <div className="text-xl font-bold text-green-600">
                    {importDetails.matchups.filter(m => !m.is_playoff).length}
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded">
                  <div className="font-medium text-purple-800">Playoffs</div>
                  <div className="text-xl font-bold text-purple-600">
                    {importDetails.matchups.filter(m => m.is_playoff).length}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="font-medium text-gray-800">Weeks</div>
                  <div className="text-xl font-bold text-gray-600">
                    {new Set(importDetails.matchups.map(m => m.week)).size}
                  </div>
                </div>
              </div>
            </div>

            {/* Assignment Section */}
            <div className="border-t pt-6">
              <h4 className="font-semibold mb-3">Assign to Season</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select Season
                  </label>
                  <select
                    className="w-full p-2 border rounded-md"
                    onChange={(e) => setSelectedSeason(e.target.value)}
                  >
                    <option value="">Choose a season...</option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name} ({season.year})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    className="w-full p-2 border rounded-md"
                    rows={3}
                    placeholder="Add any notes about this assignment..."
                    value={assignmentNotes}
                    onChange={(e) => setAssignmentNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        className="bg-green-600 hover:bg-green-700"
                        disabled={!selectedSeason}
                      >
                        Assign to Season
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Assignment</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to assign this schedule import to the selected season?
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => assignToSeason(selectedImport, selectedSeason)}
                        >
                          Confirm Assignment
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        Reject Import
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reject Import</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to reject this schedule import?
                          This will mark it as rejected and it won't appear in pending imports.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => rejectImport(selectedImport)}
                        >
                          Reject Import
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedImport(null);
                      setImportDetails(null);
                      setAssignmentNotes('');
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScheduleImportManager;
