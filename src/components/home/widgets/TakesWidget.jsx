import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Plus } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { SkeletonCards } from '../../ui/skeleton';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { getMaskedUserName } from '../../../utils/displayNameUtils';
import { useTakesBoard, useTakesSeen } from '../../../../hooks/queries/index.js';
import { TakeCard } from '../../takes/TakeCard.jsx';
import { TakeActionDialogs } from '../../takes/TakeActionDialogs.jsx';
import { useTakeActions } from '../../takes/useTakeActions.js';
import { moreHomeTakes, selectHomeTakes } from '../../takes/homeTakes.js';
import { countUnseenTakes } from '../../takes/seen.js';
import { useFitCount } from '../../../hooks/use-fit-count.js';

/**
 * The takes worth seeing today: the two newest, and every take graded in the
 * last three days (`selectHomeTakes`). Those always show. When the card has
 * room to spare — it is the last card in the narrow column on a desktop, so it
 * stretches to wherever the wide column ends — it fills that room with the
 * rest of the board, newest first (`moreHomeTakes`), as many as fit whole
 * (`useFitCount`). A card that is not stretched (a phone, a tablet) has no
 * spare room and shows the essentials only.
 *
 * Each is the board's own `TakeCard`, in its `compact` density, with the board's
 * own buttons — Hell Yeah, Hell Nah and taking either back, each shown only
 * when `milestones.js` says this viewer may — wired through `useTakeActions`
 * and `TakeActionDialogs`, the same hook and dialogs the Takes tab uses. So a
 * Hell Nah here asks the same confirmation, honours the same "don't show
 * again", and lands on the board (the hook's mutations invalidate the board's
 * key). The card body opens the take on the Takes tab, where the detail sheet
 * — and the stake accept/decline it holds — lives.
 *
 * The board is the entry the shell already holds for the Takes badge, so this
 * costs no request. **It never writes the seen mark**: two cards are not the
 * board, and marking them read would clear a badge for takes the member has
 * not seen.
 */
export default function TakesWidget({ ctx }) {
  const { seasonId } = ctx;
  const navigate = useNavigate();
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const { board, isLoading, isError, refetch } = useTakesBoard(seasonId);
  const { lastSeenAt, isMarkLoading } = useTakesSeen(user?.id);
  const actions = useTakeActions(seasonId);

  const { takes, displayNames } = board;
  const shown = useMemo(() => selectHomeTakes(takes), [takes]);
  const more = useMemo(() => moreHomeTakes(takes, shown), [takes, shown]);
  const moreKey = more.map((take) => take.id).join(',');
  const { count: moreCount, boxRef, listRef } = useFitCount(more.length, moreKey);
  const unseen = isMarkLoading ? 0 : countUnseenTakes(takes, lastSeenAt, user?.id);

  const renderTake = (take) => (
    <li key={take.id}>
      <TakeCard
        compact
        take={take}
        displayNames={displayNames}
        onOpen={() => navigate(`/takes?take=${encodeURIComponent(take.id)}`)}
        onFade={actions.requestFade}
        onWithdraw={actions.withdrawFade}
        onHellYeah={actions.requestHellYeah}
        onWithdrawHellYeah={actions.withdrawHellYeah}
        pending={actions.pendingTakeId === take.id}
      />
    </li>
  );

  const nameOf = (userId) =>
    getMaskedUserName(displayNames[userId], userId, user, isAdmin, teamOwnerNames);

  return (
    <HomeWidget
      id="takes"
      icon={Flame}
      title="Takes"
      aside={unseen > 0 ? <Badge variant="warning">{unseen > 9 ? '9+' : unseen} new</Badge> : null}
      to="/takes"
      toLabel="Open the takes board"
      loading={isLoading}
      skeleton={<SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-1" label="Loading takes" />}
      error={isError}
      onRetry={() => refetch()}
      bodyClassName="flex flex-col"
      empty={
        !isLoading &&
        shown.length === 0 && (
          <EmptyState
            icon={Flame}
            title="No takes yet"
            description="Call something before it happens."
            className="py-6"
            action={
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/takes">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Post the first take
                </Link>
              </Button>
            }
          />
        )
      }
    >
      <ul className="space-y-3">{shown.map(renderTake)}</ul>

      {/* The spare room: as tall as the stretched card's slack, and the list
          inside it is absolute, so the extra takes never make the card (or the
          column) taller than the page already made it. */}
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <ul ref={listRef} className="absolute inset-x-0 top-0 space-y-3 pt-3">
          {more.slice(0, moreCount).map(renderTake)}
        </ul>
      </div>

      <TakeActionDialogs actions={actions} takes={takes} nameOf={nameOf} />
    </HomeWidget>
  );
}
