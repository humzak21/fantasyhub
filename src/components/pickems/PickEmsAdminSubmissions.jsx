import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { UserCheck, Calendar, AlertCircle } from 'lucide-react';
import { getMaskedTeamName, getMaskedOwnerName, getMaskedUserName } from '../../utils/displayNameUtils';

const PickEmsAdminSubmissions = ({
  currentWeek,
  pickEmWeek,
  dataManager,
  loading = false,
  user = null,
  isAdmin = false
}) => {
  const [submissions, setSubmissions] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);

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

  if (!pickEmWeek) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Pick&apos;em Week</h3>
          <p className="text-muted-foreground">
            Pick&apos;ems have not been set up for week {currentWeek} yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (dataLoading || loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading submissions...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Submissions Overview - Week {currentWeek}
          </CardTitle>
          <CardDescription>
            View all user submissions for this week&apos;s pick&apos;ems
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{users.length}</div>
              <div className="text-sm text-muted-foreground">Total Participants</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{submissions.length}</div>
              <div className="text-sm text-muted-foreground">Total Picks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {pickEmWeek.submissionClosesAt ? new Date(pickEmWeek.submissionClosesAt).toLocaleDateString() : 'TBD'}
              </div>
              <div className="text-sm text-muted-foreground">Deadline</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Submissions Yet</h3>
            <p className="text-muted-foreground">
              No users have submitted picks for week {currentWeek} yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              User Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {users.map(userId => {
                const userData = submissionsByUser[userId];
                return (
                  <div key={userId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <UserCheck className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{userData.userDetails.email}</div>
                          <div className="text-sm text-muted-foreground">
                            {getMaskedUserName(userData.userDetails.displayName, userId, user, isAdmin)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">
                          {userData.submissions.length} picks
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          Submitted: {new Date(userData.submittedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {userData.submissions.map(submission => {
                        const team1 = submission.games?.team1;
                        const team2 = submission.games?.team2;
                        const pickedTeamId = submission.predictedWinnerTeamId;

                        return (
                          <div key={submission.gameId} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                            <div className="flex items-center space-x-4 flex-1">
                              <div className={`flex items-center justify-center p-4 rounded-lg border-2 transition-all w-60 ${
                                pickedTeamId === team1?.id
                                  ? 'border-blue-500 bg-[#007AFF] text-white font-semibold shadow-sm'
                                  : 'border-muted bg-background text-muted-foreground'
                              }`}>
                                <div className="text-center w-full">
                                  <div className="font-medium truncate px-2">{getMaskedTeamName(team1, user, isAdmin) || 'Team 1'}</div>
                                  <div className={`text-xs truncate px-2 ${
                                    pickedTeamId === team1?.id ? 'text-white/80' : 'text-muted-foreground'
                                  }`}>{getMaskedOwnerName(team1, user, isAdmin) || 'Owner'}</div>
                                </div>
                              </div>

                              <div className="text-muted-foreground font-medium text-center w-8">vs</div>

                              <div className={`flex items-center justify-center p-4 rounded-lg border-2 transition-all w-60 ${
                                pickedTeamId === team2?.id
                                  ? 'border-blue-500 bg-[#007AFF]/75 text-white font-semibold shadow-sm'
                                  : 'border-muted bg-background text-muted-foreground'
                              }`}>
                                <div className="text-center w-full">
                                  <div className="font-medium truncate px-2">{getMaskedTeamName(team2, user, isAdmin) || 'Team 2'}</div>
                                  <div className={`text-xs truncate px-2 ${
                                    pickedTeamId === team2?.id ? 'text-white/80' : 'text-muted-foreground'
                                  }`}>{getMaskedOwnerName(team2, user, isAdmin) || 'Owner'}</div>
                                </div>
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground">
                              Week {submission.games?.week || currentWeek}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PickEmsAdminSubmissions;