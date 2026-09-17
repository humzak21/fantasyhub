import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { EmptyState } from '../ui/empty-state';
import { IndependentColumns } from '../ui/independent-columns';
import { TeamAvatar } from '../ui/team-identity';
import { UserCheck, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMaskedTeamName, getMaskedOwnerName, getMaskedUserName } from '../../utils/displayNameUtils';
import { getDb } from '../../../services/db/index.js';

/**
 * Who submitted what, for the admin.
 *
 * This used to be a read-only copy of the *picker*: every member's every pick
 * drawn as the same two 15rem team buttons the form uses, one matchup per row,
 * stacked down the page. Fourteen members times seven matchups came to
 * somewhere near 6,000px of scrolling to answer "who hasn't picked yet" — the
 * one question this tab exists for.
 *
 * It is a card per member in three columns now, the same shape as Teams, with
 * each pick on one line: the team they took, over the team they did not. The
 * information is the same — both teams, both owners, who was picked, the count
 * and the submission time — laid out for reading rather than for choosing.
 * Nothing here is a control, so nothing here needs to be a button.
 */
const PickEmsAdminSubmissions = ({
  currentWeek,
  pickEmWeek,
  loading = false,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const [submissions, setSubmissions] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load admin submissions data
  const loadSubmissions = useCallback(async () => {
    if (!pickEmWeek) return;

    setDataLoading(true);
    setError(null);

    try {
      const submissionsData = await getDb().pickems.getAdminSubmissionsForWeek(pickEmWeek.id);
      setSubmissions(submissionsData || []);
    } catch (err) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setDataLoading(false);
    }
  }, [pickEmWeek]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Group submissions by user
  const submissionsByUser = submissions.reduce((acc, submission) => {
    const userId = submission.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userId,
        userDetails: submission.userDetails,
        submissions: [],
        submittedAt: submission.submittedAt
      };
    }
    acc[userId].submissions.push(submission);
    return acc;
  }, {});

  const users = Object.values(submissionsByUser);

  if (!pickEmWeek) {
    return (
      <Card>
        <EmptyState
          icon={UserCheck}
          title="No pick'em week"
          description={`Pick'ems have not been set up for week ${currentWeek} yet.`}
        />
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

  const deadline = pickEmWeek.submissionClosesAt
    ? new Date(pickEmWeek.submissionClosesAt).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'TBD';

  return (
    <div className="space-y-4">
      {/* The three figures were three centred 2xl numbers in their own card,
          which is a dashboard's worth of chrome for a participant count. They
          are one line above the cards now, where they read as the caption to
          what is under them. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" />
            Week {currentWeek} submissions
          </CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold tabular text-foreground">{users.length}</span>{' '}
              {users.length === 1 ? 'member' : 'members'}
            </span>
            <span>
              <span className="font-semibold tabular text-foreground">{submissions.length}</span>{' '}
              {submissions.length === 1 ? 'pick' : 'picks'}
            </span>
            <span>Closes {deadline}</span>
          </div>
        </CardHeader>
      </Card>

      {users.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserCheck}
            title="No submissions yet"
            description={`Nobody has submitted picks for week ${currentWeek}.`}
          />
        </Card>
      ) : (
        // Same independent columns as Teams: a member with seven picks must
        // not stretch the row for a member with four.
        <IndependentColumns items={users} itemKey={(entry) => entry.userId} columns={3}>
          {(entry) => (
            <MemberSubmissionCard
              entry={entry}
              currentWeek={currentWeek}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          )}
        </IndependentColumns>
      )}
    </div>
  );
};

/**
 * One member's week: who they are, when they submitted, and every pick on its
 * own line.
 */
const MemberSubmissionCard = ({ entry, currentWeek, user, isAdmin, teamOwnerNames }) => {
  const name = getMaskedUserName(
    entry.userDetails?.displayName,
    entry.userId,
    user,
    isAdmin,
    teamOwnerNames
  );

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-2.5">
          <TeamAvatar team={{ owner: name }} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight">{name}</div>
            {/* The email is how the admin ties a submission to an account in
                Approvals, so it stays — one muted line rather than the card's
                headline, which is what it was. */}
            {entry.userDetails?.email && (
              <div className="truncate text-[11px] text-muted-foreground">
                {entry.userDetails.email}
              </div>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 tabular">
            {entry.submissions.length}
          </Badge>
        </div>

        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {entry.submittedAt
            ? `Submitted ${new Date(entry.submittedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}`
            : 'Submission time unknown'}
        </div>

        {/* Named, because the card's heading is the member and the list is
            their picks — a screen reader landing on "Gridiron Gang over
            Waiver Wire Wizards" needs to be told whose pick that is. */}
        <ul aria-label={`${name}'s picks`} className="mt-3 divide-y divide-border">
          {entry.submissions.map((submission) => (
            <PickRow
              key={submission.gameId}
              submission={submission}
              currentWeek={currentWeek}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

/**
 * One pick: the team taken, over the team not taken.
 *
 * Which side was picked used to be a solid blue fill on a 15rem box — a
 * colour-only distinction, and an expensive one in space. Here the pick is the
 * line's subject and the other team follows "over", so the sentence carries it
 * with no colour at all; the tint on the picked name is reinforcement.
 */
const PickRow = ({ submission, currentWeek, user, isAdmin, teamOwnerNames }) => {
  const team1 = submission.games?.team1;
  const team2 = submission.games?.team2;
  const pickedTeamId = submission.predictedWinnerTeamId;

  // A row with no stored winner is a real state — the picker cannot produce
  // one, but a hand-rolled POST can — and it must not read as a vote for team
  // 1. Both sides stay muted and the connector says so.
  const hasPick = Boolean(pickedTeamId);
  const pickedFirst = !hasPick || pickedTeamId === team1?.id;
  const [taken, other] = pickedFirst ? [team1, team2] : [team2, team1];

  const label = (team) => ({
    name: getMaskedTeamName(team, user, isAdmin, teamOwnerNames),
    owner: getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)
  });

  const takenLabel = label(taken);
  const otherLabel = label(other);
  const week = submission.games?.week ?? currentWeek;

  return (
    <li className="flex items-baseline gap-2 py-1.5 text-xs">
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate',
            hasPick ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {takenLabel.name}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {takenLabel.owner}
        </span>
      </span>

      <span
        className={cn(
          'shrink-0 text-[10px] uppercase tracking-[0.06em]',
          hasPick ? 'text-muted-foreground' : 'text-warning'
        )}
      >
        {hasPick ? 'over' : 'no pick'}
      </span>

      <span className="min-w-0 flex-1 text-right">
        <span className="block truncate text-muted-foreground">{otherLabel.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground/70">
          {otherLabel.owner}
        </span>
      </span>

      {/* The week is the same for every row in the tab, so it is only worth
          drawing where it disagrees with the week the page is showing. */}
      {week !== currentWeek && (
        <span className="shrink-0 tabular text-[10px] text-muted-foreground">Wk {week}</span>
      )}
    </li>
  );
};

export default PickEmsAdminSubmissions;
