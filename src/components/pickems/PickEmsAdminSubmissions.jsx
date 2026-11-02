import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { EmptyState } from '../ui/empty-state';
import { IndependentColumns } from '../ui/independent-columns';
import { TeamAvatar } from '../ui/team-identity';
import { UserCheck, AlertCircle, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMaskedTeamName, getMaskedOwnerName, getMaskedUserName } from '../../utils/displayNameUtils';
import { getDb } from '../../../services/db/index.js';
import { TeamLink } from '../ui/team-link';
import { submissionMatchups, submissionScore } from './submissionBoard.js';

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
 * each matchup on one line. The information is the same — both teams, both
 * owners, who was picked, the count and the submission time — laid out for
 * reading rather than for choosing. Nothing here is a control, so nothing here
 * needs to be a button.
 *
 * The cards are for comparing, so every one draws the same rows: the form's
 * matchups in the form's order, team 1 on the left, and a row for a matchup the
 * member did not pick. Once a game is scored its pick gets a mark and the card's
 * count becomes the member's score.
 */
const PickEmsAdminSubmissions = ({
  currentWeek,
  pickEmWeek,
  games = [],
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
  const matchups = submissionMatchups(games, submissions);
  // The result column is on every card or on none, or the team columns would
  // not line up between a member with a scored pick and one without.
  const showResults = submissions.some((submission) => submission.gameCompleted);

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
              matchups={matchups}
              showResults={showResults}
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
const MemberSubmissionCard = ({
  entry,
  matchups,
  showResults,
  currentWeek,
  user,
  isAdmin,
  teamOwnerNames
}) => {
  const name = getMaskedUserName(
    entry.userDetails?.displayName,
    entry.userId,
    user,
    isAdmin,
    teamOwnerNames
  );
  const picksByGame = new Map(entry.submissions.map((pick) => [pick.gameId, pick]));
  const { correct, decided } = submissionScore(entry.submissions);

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
            {decided > 0 ? `${correct}/${decided} picks` : entry.submissions.length}
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
          {matchups.map(({ gameId, game }) => (
            <PickRow
              key={gameId}
              game={game}
              pick={picksByGame.get(gameId)}
              showResults={showResults}
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
 * One matchup, with the member's pick marked on it.
 *
 * Team 1 is always on the left, so a pick is a side of the card and two cards
 * compare at a glance. The pick is the shaded side, and the chevron points at it
 * so that which side it is survives without colour. The mark at the end of the
 * row is the result, the same pair of icons the Results tab uses.
 */
const PickRow = ({ game, pick, showResults, currentWeek, user, isAdmin, teamOwnerNames }) => {
  const team1 = game?.team1;
  const team2 = game?.team2;
  const pickedTeamId = pick?.predictedWinnerTeamId;

  // No pick is a real state — a member can miss a game that changed after they
  // submitted, and a hand-rolled POST can store no winner — and it must not read
  // as a vote for team 1. Both sides stay unshaded and the middle says so.
  const pickedFirst = Boolean(pickedTeamId) && pickedTeamId === team1?.id;
  const pickedSecond = Boolean(pickedTeamId) && pickedTeamId === team2?.id;
  const hasPick = pickedFirst || pickedSecond;

  const week = game?.week ?? currentWeek;
  const side = { user, isAdmin, teamOwnerNames };

  return (
    <li
      className={cn(
        'grid items-center gap-x-1 py-1 text-xs',
        showResults
          ? 'grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)_1rem]'
          : 'grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)]'
      )}
    >
      <PickSide team={team1} picked={pickedFirst} {...side} />

      <span className="flex justify-center text-muted-foreground">
        {pickedFirst && <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />}
        {pickedSecond && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
        {!hasPick && (
          <span className="text-center text-[10px] uppercase leading-none tracking-[0.06em] text-warning">
            no pick
          </span>
        )}
      </span>

      <PickSide team={team2} picked={pickedSecond} align="right" {...side} />

      {showResults && (
        <span className="flex justify-end">
          {hasPick && pick.gameCompleted && (
            pick.isCorrect ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-label="Hit" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" aria-label="Miss" />
            )
          )}
        </span>
      )}

      {/* The week is the same for every row in the tab, so it is only worth
          drawing where it disagrees with the week the page is showing. */}
      {week !== currentWeek && (
        <span className="col-span-full tabular text-[10px] text-muted-foreground">Wk {week}</span>
      )}
    </li>
  );
};

/** One team of a matchup: its name over its owner. */
const PickSide = ({ team, picked, align = 'left', user, isAdmin, teamOwnerNames }) => (
  <span className={cn('min-w-0 rounded px-1.5 py-1', picked && 'bg-muted', align === 'right' && 'text-right')}>
    <span className={cn('block truncate', picked ? 'font-medium text-foreground' : 'text-muted-foreground')}>
      <TeamLink team={team}>{getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}</TeamLink>
      {picked && <span className="sr-only"> (picked)</span>}
    </span>
    <span className={cn('block truncate text-[10px]', picked ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
      {getMaskedOwnerName(team, user, isAdmin, teamOwnerNames)}
    </span>
  </span>
);

export default PickEmsAdminSubmissions;
