import { useState, useEffect, useCallback } from 'react';
import { UserCheck, Calendar, AlertCircle, Clock } from 'lucide-react';

const MobilePickEmsAdminSubmissions = ({
  currentWeek,
  pickEmWeek,
  dataManager,
  loading = false
}) => {
  const [submissions, setSubmissions] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);

  // Load admin submissions data
  const loadSubmissions = useCallback(async () => {
    if (!pickEmWeek || !dataManager) return;

    setDataLoading(true);
    setError(null);

    try {
      const submissionsData = await dataManager.getAdminSubmissionsForWeek(pickEmWeek.id);
      setSubmissions(submissionsData || []);
    } catch (err) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setDataLoading(false);
    }
  }, [pickEmWeek, dataManager]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Group submissions by user
  const submissionsByUser = submissions.reduce((acc, submission) => {
    const userId = submission.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userDetails: submission.userDetails,
        submissions: [],
        submittedAt: submission.submittedAt
      };
    }
    acc[userId].submissions.push(submission);
    return acc;
  }, {});

  const users = Object.keys(submissionsByUser);

  const toggleUserExpansion = (userId) => {
    setExpandedUser(expandedUser === userId ? null : userId);
  };

  if (!pickEmWeek) {
    return (
      <div className="text-center py-12">
        <UserCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pick&apos;em Week</h3>
        <p className="text-gray-600">
          Pick&apos;ems have not been set up for week {currentWeek} yet.
        </p>
      </div>
    );
  }

  if (dataLoading || loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mb-4"></div>
        <p className="text-gray-600">Loading submissions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Submissions Overview</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{users.length}</div>
            <div className="text-sm text-gray-600">Participants</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{submissions.length}</div>
            <div className="text-sm text-gray-600">Total Picks</div>
          </div>
        </div>

        {pickEmWeek.submissionClosesAt && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>Deadline: {new Date(pickEmWeek.submissionClosesAt).toLocaleDateString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Submissions List */}
      {users.length === 0 ? (
        <div className="text-center py-12">
          <UserCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Submissions Yet</h3>
          <p className="text-gray-600">
            No users have submitted picks for week {currentWeek} yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Calendar className="h-4 w-4 text-gray-500" />
            <h3 className="font-medium text-gray-900">User Submissions</h3>
          </div>

          {users.map(userId => {
            const userData = submissionsByUser[userId];
            const isExpanded = expandedUser === userId;

            return (
              <div key={userId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* User Header */}
                <div
                  className="p-4 cursor-pointer active:bg-gray-50"
                  onClick={() => toggleUserExpansion(userId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <UserCheck className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {userData.userDetails.email}
                        </div>
                        <div className="text-sm text-gray-500">
                          {userData.userDetails.displayName !== userData.userDetails.email
                            ? userData.userDetails.displayName
                            : 'User'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="inline-flex px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {userData.submissions.length} picks
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(userData.submittedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Picks */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    <div className="p-4 space-y-3">
                      {userData.submissions.map(submission => {
                        const team1 = submission.games?.team1;
                        const team2 = submission.games?.team2;
                        const pickedTeamId = submission.predictedWinnerTeamId;

                        return (
                          <div key={submission.gameId} className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className={`px-2 py-1 rounded text-xs font-medium truncate flex-1 text-center transition-colors ${
                                  pickedTeamId === team1?.id
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-600 border'
                                }`}>
                                  {team1?.name || 'Team 1'}
                                </div>

                                <div className="text-gray-400 text-xs font-medium px-1">vs</div>

                                <div className={`px-2 py-1 rounded text-xs font-medium truncate flex-1 text-center transition-colors ${
                                  pickedTeamId === team2?.id
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-600 border'
                                }`}>
                                  {team2?.name || 'Team 2'}
                                </div>
                              </div>

                              <div className="text-xs text-gray-500 flex-shrink-0">
                                Week {submission.games?.week || currentWeek}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MobilePickEmsAdminSubmissions;