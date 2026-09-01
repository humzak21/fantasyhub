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
 * What the page says the game is.
 *
 * The reward tiers and the payout warning are league rules, not UI copy, and
 * nothing in this system enforces them — no column holds a FAAB balance and
 * grading a take moves no money. They live here, above the board, because the
 * board is where somebody decides how far out to call something, and a rule
 * nobody reads before posting is a rule that gets argued about after.
 *
 * A plain string rather than JSX so the apostrophes need no escaping and the
 * whole of it is one thing to edit.
 */
const TAKES_DESCRIPTION =
  'Call it before it happens. Rewards vary based on length of take. A take for the ' +
  'upcoming week is $5 FAAB, 3+ weeks out is $10, and anything higher is 15 FAAB, ' +
  'potentially coming for the next season, with cash rewards also in play. You can also ' +
  "bet FAAB, pubes, actual dollars (make sure to specify) in your take if you'd like to " +
  "win money from those who think your take won't hit. Be warned though, you have to pay " +
  'out everyone who wins off your take if you lose.';

/**
 * The Takes tab.
 *
 * Predictions the league posts against a milestone — a week, the end of the
 * regular season, the end of the season — that members read, and that any
 * other member can fade with a Hell Nah when the author has staked something on
 * it. The board sorts by when a take comes due, not by when it was written.
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
    fade,
    withdrawFade,
    resolveTake,
    reopenTake
  } = mutations;

  /** Which take is mid-write, so its control can disable rather than flicker.
   *  There is no optimistic update — see the note in useTakes.js. */
  const pendingTakeId =
    (fade.isPending && fade.variables?.takeId) ||
    (withdrawFade.isPending && withdrawFade.variables?.takeId) ||
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
      description={TAKES_DESCRIPTION}
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
        onFade={(take) => run(fade, { takeId: take.id }, 'Could not fade that take')}
        onWithdraw={(take) => run(withdrawFade, { takeId: take.id }, 'Could not take that back')}
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
        onFade={(take) => run(fade, { takeId: take.id }, 'Could not fade that take')}
        onWithdraw={(take) => run(withdrawFade, { takeId: take.id }, 'Could not take that back')}
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
