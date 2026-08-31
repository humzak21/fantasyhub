import { useMemo, useState } from 'react';
import { Flame, Plus } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader from '../layout/PageHeader.jsx';
import RouteLoading from '../layout/RouteLoading.jsx';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useActualWeek,
  useSeasonConfig,
  useTakesBoard,
  useTakesMutations
} from '../../../hooks/queries/index.js';
import { AddTakeDialog } from './AddTakeDialog.jsx';
import { TakeDetailSheet } from './TakeDetailSheet.jsx';
import { TakesBoard } from './TakesBoard.jsx';

/**
 * The Takes tab.
 *
 * Predictions the league posts against a milestone — a week, the end of the
 * regular season, the end of the season — that anyone can read and any member
 * can co-sign. The board sorts by when a take comes due, not by when it was
 * written.
 *
 * Identity comes from `useViewer()`, never from props, and all data goes
 * through the query hooks. This deliberately does not follow `PickEmsManager`'s
 * older manual `getDb()` pattern.
 */
export function TakesManager({ season, loading }) {
  const { isAuthenticated } = useViewer();
  const seasonConfig = useSeasonConfig();
  const actualWeek = useActualWeek();

  const seasonId = season?.id ?? null;
  const { board, isLoading: boardLoading } = useTakesBoard(seasonId);
  const mutations = useTakesMutations(seasonId);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const { takes, displayNames } = board;

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

  const {
    createTake,
    updateTake,
    deleteTake,
    plusOne,
    withdrawPlusOne,
    resolveTake,
    reopenTake
  } = mutations;

  /** Which take is mid-write, so its control can disable rather than flicker.
   *  There is no optimistic update — see the note in useTakes.js. */
  const pendingTakeId =
    (plusOne.isPending && plusOne.variables?.takeId) ||
    (withdrawPlusOne.isPending && withdrawPlusOne.variables?.takeId) ||
    (resolveTake.isPending && resolveTake.variables?.takeId) ||
    (reopenTake.isPending && reopenTake.variables?.takeId) ||
    null;

  /** Every write goes through here so a rejection is reported rather than
   *  swallowed. RLS can legitimately refuse one — the take was graded a second
   *  ago, the edit window just closed — and silence would read as success. */
  const run = async (mutation, variables, failure) => {
    try {
      await mutation.mutateAsync(variables);
      return true;
    } catch (error) {
      toast.error(`${failure}: ${error.message}`);
      return false;
    }
  };

  const openComposer = () => {
    setEditingId(null);
    setComposerOpen(true);
  };

  const handleSubmit = async ({ body, targetType, targetWeek }) => {
    if (editingTake) {
      await updateTake.mutateAsync({ takeId: editingTake.id, body });
      setEditingId(null);
      return;
    }
    await createTake.mutateAsync({ body, targetType, targetWeek });
  };

  const handleDelete = async (take) => {
    if (await run(deleteTake, { takeId: take.id }, 'Could not delete that take')) {
      setSelectedId(null);
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
      description="Call it before it happens. The admin grades every take once its milestone passes."
      badge={takes.length > 0 ? <Badge variant="secondary">{takes.length}</Badge> : null}
      actions={
        isAuthenticated ? (
          addTakeButton
        ) : (
          <p className="text-sm text-muted-foreground">Sign in to post a take.</p>
        )
      }
    />
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
        onPlusOne={(take) => run(plusOne, { takeId: take.id }, 'Could not join that take')}
        onWithdraw={(take) => run(withdrawPlusOne, { takeId: take.id }, 'Could not withdraw')}
        pendingTakeId={pendingTakeId}
        emptyAction={isAuthenticated ? addTakeButton : null}
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

      <TakeDetailSheet
        take={selectedTake}
        displayNames={displayNames}
        seasonConfig={seasonConfig}
        open={Boolean(selectedTake)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onPlusOne={(take) => run(plusOne, { takeId: take.id }, 'Could not join that take')}
        onWithdraw={(take) => run(withdrawPlusOne, { takeId: take.id }, 'Could not withdraw')}
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
      />
    </div>
  );
}

export default TakesManager;
