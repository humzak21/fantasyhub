import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import RouteLoading from '../layout/RouteLoading';
import { EmptyState } from '../ui/empty-state';
import PageHeader from '../layout/PageHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Target, Trophy, AlertCircle, Clock, UserCheck, Crosshair } from 'lucide-react';

import PickEmsSubmission from './PickEmsSubmission';
import PickEmsResults from './PickEmsResults';
import PickEmsAdminSubmissions from './PickEmsAdminSubmissions';
import PickEmsSeasonStandings from './PickEmsSeasonStandings';
import PreviousWeekWinners from './PreviousWeekWinners';

// The TD parlay board stays in its own chunk: most visits open Make Picks or
// Results and never reach it, and its season grid is the heaviest thing on
// the page. It used to be its own lazy route on the app shell; moving it here
// must not undo that.
const ParlayCommissionerDashboard = lazy(() => import('../parlay/ParlayCommissionerDashboard.jsx'));
import {
  useAllPicks,
  useAllSeasonPicks,
  usePickEmGameData,
  usePickEmMutations,
  usePickEmStandings,
  usePickEmStatus,
  usePickEmWeek,
  useUserPicks,
  useWeeklyPickEmScores
} from '../../../hooks/queries/index.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';

/** Shared empty defaults: a fresh `[]` per render is a new identity, and the
 *  form re-seeds itself whenever `userPicks` changes identity. */
const NONE = [];

/**
 * The Pick'ems tab.
 *
 * Every read is a `usePickEms` hook, keyed in `keys.js`. It used to load with
 * raw `getDb()` calls into eleven `useState`s, which meant nothing else in the
 * app could see what it had fetched and nothing it did could reach anyone
 * else's cache: a submission from the home page's widget was invisible here
 * until a reload, and a submission here left the nav's "you owe picks" dot
 * up, because that dot reads the shared `userPicks` entry this never touched.
 * Now the tab, the widget and the dot read the same entries, and
 * `usePickEmMutations` invalidates the ones a write changes.
 */
const PickEmsManager = ({
  season,
  currentWeek,
  loading = false,
  isAuthenticated = false,
  initializing = false,
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [activeTab, setActiveTab] = useState('picks');
  const [actionError, setActionError] = useState(null);

  const seasonId = season?.id ?? null;

  const weekQuery = usePickEmWeek(seasonId, currentWeek);
  const gamesQuery = usePickEmGameData(seasonId, currentWeek);
  const statusQuery = usePickEmStatus(seasonId);

  const pickEmWeek = weekQuery.data ?? null;
  const games = gamesQuery.data ?? NONE;
  const pickEmStatus = statusQuery.data?.find((s) => s.weekNumber === currentWeek) ?? null;
  const previousWeekStatus = statusQuery.data?.find((s) => s.weekNumber === currentWeek - 1) ?? null;
  const resultsAvailable = Boolean(pickEmStatus?.resultsAvailable);
  const hasWeek = Boolean(pickEmWeek);

  // The viewer's own picks only when there is a viewer: an anonymous visitor
  // issues no query rather than one that answers [].
  const userPicksQuery = useUserPicks(pickEmWeek?.id, { enabled: Boolean(user) });
  const standingsQuery = usePickEmStandings(seasonId, { enabled: hasWeek });
  const seasonPicksQuery = useAllSeasonPicks(seasonId, { enabled: hasWeek });
  const allPicksQuery = useAllPicks(pickEmWeek?.id, { enabled: resultsAvailable });
  const scoresQuery = useWeeklyPickEmScores(pickEmWeek?.id, { enabled: resultsAvailable });

  const { submitPicks, createWeek } = usePickEmMutations(seasonId);

  // What the page waits on before drawing anything: the week, its games and
  // the window — and the viewer's picks, so the form does not paint empty and
  // then fill. A disabled query reads as pending forever, so each wait is
  // guarded by the condition that enables it.
  const dataLoading = Boolean(
    seasonId &&
      (weekQuery.isPending ||
        gamesQuery.isPending ||
        statusQuery.isPending ||
        (hasWeek && user && userPicksQuery.isPending))
  );

  const queryError = [weekQuery, gamesQuery, statusQuery, userPicksQuery].find((q) => q.error)?.error;
  const error = actionError ?? (queryError ? queryError.message || "Failed to load pick'em data" : null);

  // Switch to results tab when results become available and user is on picks tab
  useEffect(() => {
    if (resultsAvailable && activeTab === 'picks') {
      setActiveTab('results');
    }
  }, [resultsAvailable, activeTab]);

  // The form awaits this and reports a refusal itself; the mutation's
  // `onSuccess` refreshes `userPicks` and the season's pick'em entries, which
  // is what the nav dot and the home page read too.
  const handleSubmitPicks = useCallback(
    (pickEmWeekId, picks) => submitPicks.mutateAsync({ pickEmWeekId, picks }),
    [submitPicks]
  );

  // Handle creating pick'em week (admin only)
  const handleCreatePickEmWeek = useCallback(async () => {
    if (!isAdmin || !season) return;
    setActionError(null);
    try {
      await createWeek.mutateAsync({ week: currentWeek });
    } catch (err) {
      setActionError(err.message || "Failed to create pick'em week");
    }
  }, [isAdmin, season, currentWeek, createWeek]);

  const getStatusBadge = () => {
    if (!pickEmStatus) return null;

    const variants = {
      upcoming: 'secondary',
      open: 'default',
      closed: 'destructive',
      completed: 'outline'
    };

    return (
      <Badge variant={variants[pickEmStatus.status] || 'outline'}>
        {pickEmStatus.status.charAt(0).toUpperCase() + pickEmStatus.status.slice(1)}
      </Badge>
    );
  };

  // A loader, not `null`. The comment this replaces said the full-screen
  // overlay was covering the wait — that overlay was removed for blocking the
  // whole page on every mutation, which left this branch rendering an entirely
  // blank tab for as long as the fetch took. The header stays up so the page
  // has an identity while its data arrives.
  if (initializing || dataLoading) {
    return (
      <>
        <PageHeader icon={Target} title="Pick'ems" />
        <RouteLoading />
      </>
    );
  }

  if (!season) {
    return (
      <>
        <PageHeader icon={Target} title="Pick'ems" />
        <Card>
          <EmptyState
            icon={Target}
            title="No season available"
            description="Pick'ems need an active season to be configured."
          />
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* The same header the loading branch above renders, so the page does
          not swap one header for another when the data lands — that swap was
          a visible flash on every visit. The week's status is the badge, the
          deadline sits beside the actions, and the admin's one control is the
          action itself rather than a labelled "Admin Controls" strip. */}
      <PageHeader
        icon={Target}
        title="Pick'ems"
        description={`Week ${currentWeek} — predict matchup winners and compete with your leaguemates.`}
        badge={getStatusBadge()}
        actions={
          pickEmStatus?.timeInfo || (isAdmin && !pickEmWeek) ? (
            <>
              {pickEmStatus?.timeInfo && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {pickEmStatus.timeInfo}
                </span>
              )}
              {isAdmin && !pickEmWeek && (
                <Button
                  onClick={handleCreatePickEmWeek}
                  disabled={createWeek.isPending}
                  size="sm"
                  variant="outline"
                >
                  Create pick'em week
                </Button>
              )}
            </>
          ) : null
        }
      >
        {/* Rendered whether or not this week has a pick'em row, so the first
            playoff week still names the last regular-season winners. The
            gate is here as well as inside the strip because PageHeader wraps
            any children in a margin, and most weeks' unrevealed or missing
            previous week should not leave an empty gap under the title. */}
        {previousWeekStatus?.resultsAvailable && (
          <PreviousWeekWinners week={currentWeek - 1} status={previousWeekStatus} />
        )}
      </PageHeader>

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main content */}
      {!pickEmWeek ? (
        <Card>
          {/* The admin sentence used to be an `&apos;` inside a JavaScript
              string literal rather than JSX text, so it reached the page
              undecoded and the reader saw "pick&apos;em week". */}
          <EmptyState
            icon={Target}
            title="No pick'ems this week"
            description={
              isAdmin
                ? `Week ${currentWeek} has no pick'em week yet. Create one with the button above.`
                : `Week ${currentWeek} has no pick'em week yet.`
            }
          />
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* No `grid grid-cols-N` any more. The strip is four tabs wide for
              the commissioner, and a grid divides the width by the tab count
              regardless of how long "Submissions" is; TabsList scrolls and
              collapses each label to its icon below sm: on its own. */}
          <TabsList className="w-full">
            {!pickEmStatus?.resultsAvailable && (
              <TabsTrigger value="picks" icon={<Target />}>
                Make Picks
              </TabsTrigger>
            )}
            {pickEmStatus?.resultsAvailable && (
              <TabsTrigger value="results" icon={<Trophy />}>
                Results
              </TabsTrigger>
            )}
            <TabsTrigger value="standings" icon={<Trophy />}>
              Standings
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" icon={<UserCheck />}>
                Submissions
              </TabsTrigger>
            )}
            {/* The league-wide parlay view, open to everyone who can open
                Pick'ems. It was the commissioner's tab until 2026-09-29, but
                `td_parlay_picks` has been public-read since the board started
                showing picks as they are submitted, so the gate hid nothing
                from PostgREST — it only kept members from a view of their own
                competition. Do not gate it on `isParlayCommissioner` again. */}
            <TabsTrigger value="parlay" icon={<Crosshair />}>
              TD Parlay
            </TabsTrigger>
          </TabsList>

          <TabsContent value="picks">
            <PickEmsSubmission
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              games={games}
              userPicks={userPicksQuery.data ?? NONE}
              onSubmitPicks={handleSubmitPicks}
              loading={dataLoading}
              canSubmit={pickEmStatus?.canSubmit || false}
              timeRemaining={pickEmWeek?.submissionClosesAt}
              user={user}
              /* `isAuthenticated` is the shell's "may submit", which is
                 approval; the second flag only picks the copy for a
                 signed-in account that is still waiting. */
              isApproved={isAuthenticated}
              awaitingApproval={Boolean(user) && !isAuthenticated}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </TabsContent>

          <TabsContent value="results">
            <PickEmsResults
              season={season}
              currentWeek={currentWeek}
              pickEmWeek={pickEmWeek}
              games={games}
              weeklyScores={scoresQuery.data ?? NONE}
              allPicks={allPicksQuery.data ?? NONE}
              loading={resultsAvailable && (scoresQuery.isPending || allPicksQuery.isPending)}
              resultsAvailable={resultsAvailable}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </TabsContent>

          <TabsContent value="standings">
            <PickEmsSeasonStandings
              season={season}
              currentWeek={currentWeek}
              seasonStandings={standingsQuery.data ?? NONE}
              seasonPicks={seasonPicksQuery.data ?? NONE}
              loading={standingsQuery.isPending || seasonPicksQuery.isPending}
              resultsAvailable={resultsAvailable}
              user={user}
              isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin">
              <PickEmsAdminSubmissions
                currentWeek={currentWeek}
                pickEmWeek={pickEmWeek}
                loading={dataLoading}
                user={user}
                isAdmin={isAdmin}
              teamOwnerNames={teamOwnerNames}
              />
            </TabsContent>
          )}

          <TabsContent value="parlay">
            <Suspense fallback={<RouteLoading />}>
              <ParlayCommissionerDashboard season={season} embedded />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}

    </div>
  );
};

export default PickEmsManager;