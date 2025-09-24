import React, { useState, useEffect, useCallback } from 'react';
import { Target, Trophy, Settings, AlertCircle, Clock, Plus, UserCheck } from 'lucide-react';
import MobilePickEmsSubmission from './MobilePickEmsSubmission';
import MobilePickEmsResults from './MobilePickEmsResults';
import MobilePickEmsAdminSubmissions from './MobilePickEmsAdminSubmissions';
import MobileButton from './MobileButton';

const MobilePickEms = ({
  season,
  currentWeek,
  dataManager,
  loading = false,
  isAuthenticated = false,
  isAdmin = false,
  user = null
}) => {
  const [activeTab, setActiveTab] = useState('picks');
  const [pickEmWeek, setPickEmWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [userPicks, setUserPicks] = useState([]);
  const [allPicks, setAllPicks] = useState([]);
  const [weeklyScores, setWeeklyScores] = useState([]);
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [pickEmStatus, setPickEmStatus] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPickEmData = useCallback(async () => {
    if (!season || !dataManager || !currentWeek) return;

    setDataLoading(true);
    setError(null);

    try {
      const [pickEmWeekData, gamesData, statusData] = await Promise.all([
        dataManager.getPickEmWeek(season.id, currentWeek),
        dataManager.getPickEmGameData(season.id, currentWeek),
        dataManager.getPickEmStatus(season.id)
      ]);

      setPickEmWeek(pickEmWeekData);
      setGames(gamesData || []);

      const currentWeekStatus = statusData?.find(s => s.weekNumber === currentWeek);
      setPickEmStatus(currentWeekStatus);

      if (pickEmWeekData) {
        const userPicksData = await dataManager.getUserPicksForWeek(pickEmWeekData.id);
        setUserPicks(userPicksData || []);

        if (currentWeekStatus?.resultsAvailable) {
          const [allPicksData, weeklyScoresData, seasonStandingsData] = await Promise.all([
            dataManager.getAllPicksForWeek(pickEmWeekData.id),
            dataManager.getWeeklyPickEmScores(pickEmWeekData.id),
            dataManager.getSeasonPickEmStandings(season.id)
          ]);

          setAllPicks(allPicksData || []);
          setWeeklyScores(weeklyScoresData || []);
          setSeasonStandings(seasonStandingsData || []);
        } else {
          setAllPicks([]);
          setWeeklyScores([]);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load pick\'em data');
    } finally {
      setDataLoading(false);
    }
  }, [season, dataManager, currentWeek]);

  useEffect(() => {
    loadPickEmData();
  }, [loadPickEmData]);

  const handleSubmitPicks = useCallback(async (pickEmWeekId, picks) => {
    try {
      await dataManager.submitPickEmPicks(pickEmWeekId, picks);
      const userPicksData = await dataManager.getUserPicksForWeek(pickEmWeekId);
      setUserPicks(userPicksData || []);
    } catch (err) {
      throw new Error(err.message || 'Failed to submit picks');
    }
  }, [dataManager]);

  const handleCreatePickEmWeek = useCallback(async () => {
    if (!isAdmin || !season) return;

    setDataLoading(true);
    try {
      await dataManager.createPickEmWeek(season.id, currentWeek);
      await loadPickEmData();
    } catch (err) {
      setError(err.message || 'Failed to create pick\'em week');
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin, season, currentWeek, dataManager, loadPickEmData]);

  const handleCalculateResults = useCallback(async () => {
    if (!isAdmin || !pickEmWeek) return;

    setDataLoading(true);
    try {
      await dataManager.calculatePickEmResults(pickEmWeek.id);
      await loadPickEmData();
      setActiveTab('results');
    } catch (err) {
      setError(err.message || 'Failed to calculate results');
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin, pickEmWeek, dataManager, loadPickEmData]);

  const getStatusInfo = () => {
    if (!pickEmStatus) return null;

    const statusConfig = {
      upcoming: { color: 'bg-blue-100 text-blue-800', message: 'Upcoming' },
      open: { color: 'bg-green-100 text-green-800', message: 'Open' },
      closed: { color: 'bg-red-100 text-red-800', message: 'Closed' },
      completed: { color: 'bg-gray-100 text-gray-800', message: 'Completed' }
    };

    return statusConfig[pickEmStatus.status] || statusConfig.completed;
  };

  if (!season) {
    return (
      <div className="text-center py-12">
        <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Season Available</h3>
        <p className="text-gray-600">
          Pick'ems require an active season to be configured.
        </p>
      </div>
    );
  }

  const statusInfo = getStatusInfo();

  return (
    <div className="space-y-4">
      {/* Admin controls */}
      {isAdmin && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-900 text-sm">Admin Controls</span>
          </div>

          {statusInfo && (
            <div className={`inline-flex px-3 py-1 rounded-full text-xs font-medium mb-3 ${statusInfo.color}`}>
              {statusInfo.message}
            </div>
          )}

          {pickEmStatus?.timeInfo && (
            <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
              <Clock className="h-4 w-4" />
              {pickEmStatus.timeInfo}
            </div>
          )}

          <div className="flex gap-2">
            {!pickEmWeek && (
              <MobileButton
                onClick={handleCreatePickEmWeek}
                disabled={dataLoading}
                size="sm"
                variant="secondary"
                className="flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Create Week
              </MobileButton>
            )}

            {pickEmWeek && pickEmStatus?.status === 'closed' && (
              <MobileButton
                onClick={handleCalculateResults}
                disabled={dataLoading}
                size="sm"
                variant="secondary"
                className="flex items-center gap-1"
              >
                <Trophy className="h-3 w-3" />
                Calculate Results
              </MobileButton>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {!pickEmWeek ? (
        <div className="text-center py-12">
          <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Pick'ems Not Available</h3>
          <p className="text-gray-600 mb-4">
            Pick'ems haven't been set up for week {currentWeek} yet.
          </p>
          {isAdmin && (
            <p className="text-gray-500 text-sm">
              Use the admin controls above to create a pick'em week.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Tab navigation */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
            <div className={`grid gap-2 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <MobileButton
                onClick={() => setActiveTab('picks')}
                variant={activeTab === 'picks' ? 'secondary' : 'primary'}
                size="lg"
                className="flex items-center justify-center gap-2 px-3 py-3 font-semibold shadow-sm text-sm"
              >
                <Target className="h-4 w-4" />
                <span className="hidden xs:inline">Make Picks</span>
                <span className="xs:hidden">Picks</span>
              </MobileButton>
              <MobileButton
                onClick={() => setActiveTab('results')}
                variant={activeTab === 'results' ? 'secondary' : 'primary'}
                size="lg"
                className="flex items-center justify-center gap-2 px-3 py-3 font-semibold shadow-sm text-sm"
              >
                <Trophy className="h-4 w-4" />
                Results
              </MobileButton>
              {isAdmin && (
                <MobileButton
                  onClick={() => setActiveTab('admin')}
                  variant={activeTab === 'admin' ? 'secondary' : 'primary'}
                  size="lg"
                  className="flex items-center justify-center gap-2 px-3 py-3 font-semibold shadow-sm text-sm"
                >
                  <UserCheck className="h-4 w-4" />
                  <span className="hidden xs:inline">Submissions</span>
                  <span className="xs:hidden">Admin</span>
                </MobileButton>
              )}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === 'picks' && (
            <MobilePickEmsSubmission
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              games={games}
              userPicks={userPicks}
              onSubmitPicks={handleSubmitPicks}
              loading={dataLoading}
              canSubmit={pickEmStatus?.canSubmit || false}
              timeRemaining={pickEmWeek?.submissionClosesAt}
              user={user}
            />
          )}

          {activeTab === 'results' && (
            <MobilePickEmsResults
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              weeklyScores={weeklyScores}
              seasonStandings={seasonStandings}
              allPicks={allPicks}
              userPicks={userPicks}
              loading={dataLoading}
              resultsAvailable={pickEmStatus?.resultsAvailable || false}
            />
          )}

          {activeTab === 'admin' && isAdmin && (
            <MobilePickEmsAdminSubmissions
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              dataManager={dataManager}
              loading={dataLoading}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MobilePickEms;