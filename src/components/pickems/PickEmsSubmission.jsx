import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Clock, Users, Target, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
import PickEmsSubmitBar from './PickEmsSubmitBar';
import MatchupResearchSection from './MatchupResearchSection';
import ParlayPickSection from './ParlayPickSection';
import TourneyNote from './TourneyNote.jsx';
import LeaguePickSplit, { LeaguePickSplitNote } from './LeaguePickSplit.jsx';
import { PickEmGameRow } from './PickEmGameRow.jsx';
import { isByeGame } from './pickSplit.js';
import { isWindowClosed, pickEmWindowState } from './pickEmWindow.js';
import { usePickEmForm } from './usePickEmForm.js';

/**
 * The `userPicks` default, shared. The form re-seeds itself when `userPicks`
 * changes identity, so a fresh `[]` per render re-ran that on every render,
 * forever — the page hung whenever the prop was left out.
 */
const NO_PICKS = [];

const PickEmsSubmission = ({
  season,
  currentWeek,
  pickEmWeek,
  games,
  userPicks = NO_PICKS,
  onSubmitPicks,
  loading = false,
  canSubmit = false,
  timeRemaining = null,
  user = null,
  isApproved = false,
  awaitingApproval = false,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  // The selection, the edit state and the draft live in `usePickEmForm`, which
  // the home page's pick'ems widget uses too: a pick made on either is on the
  // other, and survives a reload, until it is submitted.
  const form = usePickEmForm({
    pickEmWeek,
    games,
    userPicks,
    userId: user?.id ?? null,
    submit: onSubmitPicks
  });
  const { picks, availableGames, selectableGames, hasSubmitted, isEditing, error, showConfirmation } = form;

  // The NFL season the opponent chips are keyed on. `espn_season_year` is the
  // year ESPN's calendar endpoint is keyed by; `year` is the same value today
  // and is the fallback for a season row created before that column existed.
  const nflSeasonYear = season?.espnSeasonYear ?? season?.espn_season_year ?? season?.year ?? null;

  // One definition of the window, shared with the home widget.
  const status = pickEmWindowState(pickEmWeek);
  // The same test ParlayPickSection's `isRevealed` makes over this `status`:
  // one window, stated by the form that owns it.
  const picksClosed = isWindowClosed(status);

  return (
    <div className="space-y-6">
      {/* Header with status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Week {currentWeek} Pick'ems
              </CardTitle>
              <CardDescription>
                Pick the winners for this week's matchups
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                variant={
                  status.status === 'open' ? 'default' :
                  status.status === 'upcoming' ? 'secondary' :
                  status.status === 'closed' ? 'destructive' : 'outline'
                }
                className="flex items-center gap-1"
              >
                <Clock className="h-3 w-3" />
                {status.message}
              </Badge>

              {status.timeInfo && (
                <span className="text-sm text-muted-foreground">
                  {status.timeInfo}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        {/* The tourney rules, where the decision to enter is being made. The
            Standings tab states the same two prizes from the same module —
            see `tourneys.js` for why they are not written twice.

            Once the window closes, the note on how the league picked sits
            under them: the last thing in this card, directly above the row
            it explains. */}
        <CardContent className="space-y-3">
          <TourneyNote compact currentWeek={currentWeek} />
          <LeaguePickSplitNote pickEmWeek={pickEmWeek} games={games} closed={picksClosed} />
        </CardContent>
      </Card>

      {/* How the league picked, between the week's card and the parlay. It
          renders nothing until the window closes — see LeaguePickSplit. Once
          the week is scored this page gives way to Results, which shows the
          same boxes with the winners marked. */}
      <LeaguePickSplit
        pickEmWeek={pickEmWeek}
        games={games}
        closed={picksClosed}
        week={currentWeek}
      />

      {/* Success confirmation */}
      {showConfirmation && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Your picks have been successfully submitted! You can still edit them until the submission deadline.
          </AlertDescription>
        </Alert>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* The parlay leads the page. It used to sit under the pick'ems submit
          bar so the page would not show two submit buttons in a row; it is now
          the first thing on it because it is the pick people forget, and a
          card below fourteen matchups is a card nobody scrolls to. Its own
          Submit is inside its own card, so which button saves what stays clear.

          `status` is passed rather than recomputed so the two windows are the
          same window by construction. The section renders nothing without a
          pick'em week, which is the whole of the "only when pick'ems is
          activated" rule. */}
      <ParlayPickSection
        pickEmWeek={pickEmWeek}
        seasonYear={nflSeasonYear}
        status={status}
        weekNumber={currentWeek}
      />

      {/* Research, above the picks: the point of it is to be read before a
          choice is made, and a panel underneath the buttons is a panel nobody
          opens. Every matchup is listed; each one folds open to its lineups —
          see MatchupResearchSection. */}
      {status.status !== 'no-week' && availableGames.length > 0 && (
        <MatchupResearchSection
          seasonId={season?.id ?? pickEmWeek?.seasonId ?? null}
          seasonYear={nflSeasonYear}
          week={currentWeek}
          games={availableGames}
        />
      )}

      {/* Games list */}
      {status.status === 'no-week' ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pick'em Week Available</h3>
            <p className="text-muted-foreground">
              Pick'ems have not been set up for week {currentWeek} yet.
            </p>
          </CardContent>
        </Card>
      ) : availableGames.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Games Available</h3>
            <p className="text-muted-foreground">
              All games for week {currentWeek} have been completed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {availableGames.map((game) => {
            const isBye = isByeGame(game);
            // One expression for "may this viewer change this pick", instead
            // of the same four-clause condition repeated in each button's
            // onClick, its `disabled` and twice more in its class string.
            // `isApproved`, not just a user: `submit_pick_em_picks` refuses an
            // unapproved account, so a pick it could make is a pick it could
            // never submit.
            const canPick = Boolean(user) && isApproved && status.status === 'open' && form.canEdit;
            return (
              <Card key={game.id} className={`overflow-hidden ${isBye ? 'bg-muted/30' : ''}`}>
                <CardContent className="p-4 sm:p-6">
                  <PickEmGameRow
                    game={game}
                    number={selectableGames.findIndex((g) => g.id === game.id) + 1}
                    selectedTeamId={picks[game.id] ?? null}
                    canPick={canPick}
                    onPick={(teamId) => form.pick(game.id, teamId)}
                    user={user}
                    isAdmin={isAdmin}
                    teamOwnerNames={teamOwnerNames}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {status.status === 'open' && availableGames.length > 0 && (
        <PickEmsSubmitBar
          totalPicks={form.totalPicks}
          totalGames={selectableGames.length}
          hasSubmitted={hasSubmitted}
          isEditing={isEditing}
          hasChanges={form.hasChanges}
          submitting={form.submitting}
          user={isApproved ? user : null}
          signInMessage={
            awaitingApproval
              ? 'Your account is awaiting approval before you can make picks.'
              : 'Sign in to make picks.'
          }
          onSubmit={form.handleSubmit}
          onEdit={form.startEdit}
          onCancelEdit={form.cancelEdit}
        />
      )}

    </div>
  );
};

export default PickEmsSubmission;