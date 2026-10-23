import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, Plus } from 'lucide-react';

import PageHeader from '../layout/PageHeader.jsx';
import RouteLoading from '../layout/RouteLoading.jsx';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import {
  useActualWeek,
  useLeagueMembers,
  useSeasonConfig,
  useTakeActivity,
  useTakesBoard,
  useTakesSeen
} from '../../../hooks/queries/index.js';
import { AddTakeDialog } from './AddTakeDialog.jsx';
import { TakeActionDialogs } from './TakeActionDialogs.jsx';
import { TakeDetailSheet } from './TakeDetailSheet.jsx';
import { useTakeActions } from './useTakeActions.js';
import { TakesBoard } from './TakesBoard.jsx';
import { TakesRules } from './TakesRules.jsx';
import { newestTakeAt } from './seen.js';

/** One line, as `PageHeader` asks. The rules themselves are `TakesRules`,
 *  under it — what you can win, what you can bet, and how it works. */
const TAKES_DESCRIPTION = 'Call it before it happens.';

/**
 * The Takes tab.
 *
 * Predictions the league posts against a milestone — a week, the end of the
 * regular season, the end of the season — that members read, back with a Hell
 * Yeah, and fade with a Hell Nah when the author has staked something on it.
 * The board sorts by when a take comes due, not by when it was written.
 *
 * Identity comes from `useViewer()`, never from props, and all data goes
 * through the query hooks. This deliberately does not follow `PickEmsManager`'s
 * older manual `getDb()` pattern.
 */
export function TakesManager({ season, loading }) {
  // `isAuthenticated` is the prop, and the shell passes approval as it — but
  // the copy below has to tell a signed-in, unapproved member apart from a
  // visitor, so the real session flag is read here as well.
  const { user, isAuthenticated: hasSession, isApproved, isAdmin, teamOwnerNames } = useViewer();
  const seasonConfig = useSeasonConfig();
  const actualWeek = useActualWeek();

  const seasonId = season?.id ?? null;
  const { board, isLoading: boardLoading } = useTakesBoard(seasonId);
  // The member's acts on a take — Hell Yeah, Hell Nah, taking either back,
  // answering a stake — and their confirmations. Shared with the home page's
  // takes card, so there is one answer to "has this member opted out of the
  // Hell Nah confirmation"; see `useTakeActions`.
  const actions = useTakeActions(seasonId);
  const { mutations, run } = actions;

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // `/takes?take=<id>` opens that take's sheet. It is where a take
  // notification lands (scripts/send-notifications.js --takes), so tapping
  // "Sam said Hell Nah to your take" shows the take rather than the board.
  // A link to a take that is not on this board — deleted, another season —
  // opens nothing, because `selectedTake` below finds no row.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedTakeId = searchParams.get('take');
  const [selectedId, setSelectedId] = useState(linkedTakeId);
  useEffect(() => {
    if (linkedTakeId) setSelectedId(linkedTakeId);
  }, [linkedTakeId]);

  const closeSheet = () => {
    setSelectedId(null);
    // Closing drops the link, so a reload or the back button does not reopen
    // a sheet the member just closed.
    if (linkedTakeId) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('take');
        return next;
      }, { replace: true });
    }
  };

  const { takes, displayNames } = board;
  const nameOf = (userId) =>
    getMaskedUserName(displayNames[userId], userId, user, isAdmin, teamOwnerNames);

  // Reading the tab is what clears the nav badge. The mark is the newest
  // take's own timestamp rather than the clock — see `newestTakeAt` — and it
  // is set once the board has actually rendered, not while it is loading,
  // because a skeleton is not a read.
  //
  // The write lands in the query cache the shell's badge reads, so the count
  // clears without anything being passed between the two.
  //
  // It waits on `isMarkLoading` as well as on the board, and that is not
  // belt-and-braces: `markSeen` skips a mark that would not move forward, and
  // it can only know that once the stored one has arrived. Firing early posts
  // a write on every cold load — harmless, since the RPC keeps
  // `greatest(stored, incoming)`, but a request whose answer is already known.
  // `isMarkLoading` in the dependency array is what re-runs this once it lands.
  const { markSeen, isMarkLoading } = useTakesSeen(user?.id, { enabled: isApproved });
  const newestAt = useMemo(() => newestTakeAt(takes), [takes]);
  useEffect(() => {
    if (!isApproved || boardLoading || isMarkLoading || !newestAt) return;
    markSeen(newestAt);
  }, [isApproved, boardLoading, isMarkLoading, newestAt, markSeen]);

  // The sheet and the composer hold an *id*, not a row. After a mutation the
  // board refetches and hands back a new object; holding the row itself would
  // leave both showing the take as it was before the +1 landed.
  const selectedTake = useMemo(
    () => takes.find((take) => take.id === selectedId) ?? null,
    [takes, selectedId]
  );
  const editingTake = useMemo(
    () => takes.find((take) => take.id === editingId) ?? null,
    [takes, editingId]
  );

  // Deferred until a take is open — the log appears nowhere else, and `enabled`
  // inside the hook makes a null id the resting state rather than a bug. It
  // lives here rather than in the sheet so the sheet stays presentational,
  // matching how the take itself is passed down.
  const { activity, isLoading: activityLoading } = useTakeActivity(seasonId, selectedId);

  // The admin's author and Hell Nah pickers. Deferred like the log, and never
  // issued for anyone else: `list_league_members()` returns nothing to a
  // non-admin anyway, so the request would only ever be wasted.
  const { data: members = [] } = useLeagueMembers({ enabled: isAdmin && Boolean(selectedId) });

  const {
    createTake,
    updateTake,
    deleteTake,
    resolveTake,
    reopenTake,
    adminUpdateTake,
    addFadeFor,
    removeFadeFor
  } = mutations;

  /** Which take is mid-write: a member act (the hook's) or one of the admin's
   *  own, so its control can disable rather than flicker. */
  const pendingTakeId =
    actions.pendingTakeId ||
    (resolveTake.isPending && resolveTake.variables?.takeId) ||
    (reopenTake.isPending && reopenTake.variables?.takeId) ||
    (addFadeFor.isPending && addFadeFor.variables?.takeId) ||
    (removeFadeFor.isPending && removeFadeFor.variables?.takeId) ||
    null;

  const { requestFade, requestHellYeah, answerStake } = actions;

  const openComposer = () => {
    setEditingId(null);
    setComposerOpen(true);
  };

  const handleSubmit = async ({ body, targetType, targetWeek, wager }) => {
    if (editingTake) {
      // The milestone is deliberately not sent: `takes_guard_author_update`
      // rejects a move, and the composer disables the control to match.
      await updateTake.mutateAsync({ takeId: editingTake.id, body, wager });
      setEditingId(null);
      return;
    }
    await createTake.mutateAsync({ body, targetType, targetWeek, wager });
  };

  const handleDelete = async (take) => {
    if (await run(deleteTake, { takeId: take.id }, 'Could not delete that take')) {
      closeSheet();
    }
  };

  const addTakeButton = (
    <Button onClick={openComposer} className="gap-1.5">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Post a take
    </Button>
  );

  const header = (
    <PageHeader
      icon={Flame}
      title="Takes"
      description={TAKES_DESCRIPTION}
      badge={takes.length > 0 ? <Badge variant="secondary">{takes.length}</Badge> : null}
      actions={
        isApproved ? (
          addTakeButton
        ) : (
          <p className="text-sm text-muted-foreground">
            {hasSession ? 'Your account is awaiting approval.' : 'Sign in to post a take.'}
          </p>
        )
      }
    >
      <TakesRules />
    </PageHeader>
  );

  // Never `return null`, which renders a blank tab. The header is known before
  // the data is, so it stays put and only the board below it is standing in.
  if (loading || boardLoading) {
    return (
      <div>
        {header}
        <RouteLoading />
      </div>
    );
  }

  if (!season) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Flame}
          title="No active season"
          description="Takes are posted against a season's calendar, so there is nothing to predict until one is set up."
        />
      </div>
    );
  }

  return (
    <div>
      {header}

      <TakesBoard
        takes={takes}
        displayNames={displayNames}
        seasonConfig={seasonConfig}
        onOpen={(take) => setSelectedId(take.id)}
        onFade={requestFade}
        onWithdraw={actions.withdrawFade}
        onHellYeah={requestHellYeah}
        onWithdrawHellYeah={actions.withdrawHellYeah}
        pendingTakeId={pendingTakeId}
        emptyAction={isApproved ? addTakeButton : null}
      />

      <AddTakeDialog
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setEditingId(null);
        }}
        seasonConfig={seasonConfig}
        defaultWeek={actualWeek}
        take={editingTake}
        onSubmit={handleSubmit}
        submitting={createTake.isPending || updateTake.isPending}
      />

      <TakeActionDialogs actions={actions} takes={takes} nameOf={nameOf} />

      <TakeDetailSheet
        take={selectedTake}
        displayNames={displayNames}
        seasonConfig={seasonConfig}
        activity={activity}
        activityLoading={activityLoading}
        open={Boolean(selectedTake)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        onFade={requestFade}
        onWithdraw={actions.withdrawFade}
        onHellYeah={requestHellYeah}
        onWithdrawHellYeah={actions.withdrawHellYeah}
        onRespondToStake={answerStake}
        onEdit={(take) => {
          setEditingId(take.id);
          setComposerOpen(true);
        }}
        onDelete={handleDelete}
        onResolve={(take, status) =>
          run(resolveTake, { takeId: take.id, status }, 'Could not grade that take')
        }
        onReopen={(take) => run(reopenTake, { takeId: take.id }, 'Could not reopen that take')}
        pending={pendingTakeId === selectedTake?.id}
        members={members}
        // Not through `run`: the editor shows a refusal beside the form it came
        // from, and has to know the save failed so it stays open.
        onAdminSave={(take, patch) => adminUpdateTake.mutateAsync({ takeId: take.id, patch })}
        adminSaving={adminUpdateTake.isPending}
        onAdminAddFade={(take, userId) =>
          run(addFadeFor, { takeId: take.id, userId }, 'Could not add that Hell Nah')
        }
        onAdminRemoveFade={(take, userId) =>
          run(removeFadeFor, { takeId: take.id, userId }, 'Could not remove that Hell Nah')
        }
      />
    </div>
  );
}

export default TakesManager;
