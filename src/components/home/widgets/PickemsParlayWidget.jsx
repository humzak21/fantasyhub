import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Crosshair, Target } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { formatOrdinal } from '../../../utils/format';
import { getMaskedUserName } from '../../../utils/displayNameUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import {
  useAllPicks,
  useApprovedMemberCount,
  useNow,
  useParlayLive,
  useParlayWeekPicks,
  usePickEmGameData,
  usePickEmMutations,
  usePickEmWeek,
  useUserPicks,
  useWeeklyPickEmScores
} from '../../../../hooks/queries/index.js';
import { PickEmGameRow } from '../../pickems/PickEmGameRow.jsx';
import { isByeGame } from '../../pickems/pickSplit.js';
import PickEmsSubmitBar from '../../pickems/PickEmsSubmitBar.jsx';
import ParlayMyPick from '../../pickems/ParlayMyPick.jsx';
import { formatCountdown, isWindowClosed, pickEmWindowState } from '../../pickems/pickEmWindow.js';
import { usePickEmForm } from '../../pickems/usePickEmForm.js';
import { pickemCounters, viewerWeekResult } from '../../../../utils/home/pickems.js';

const NONE = [];
const MINUTE = 60_000;

/**
 * The week's pick'ems and TD parlay, folded into one card.
 *
 * The parlay pick is always in view; the pick'ems are under a disclosure.
 * Both can be made and submitted here, through the very components and form
 * state the Pick'ems tab uses — `ParlayMyPick`, `PickEmGameRow`,
 * `usePickEmForm`, `PickEmsSubmitBar` — so a selection made here and not yet
 * submitted is on the tab (and survives a reload), and a submission here is
 * on the tab without a refetch of its own: every read is the tab's cache
 * entry, and every write the tab's mutation.
 *
 * What it shows follows the window (`pickEmWindowState`, the one definition):
 * before it opens, when it opens and the last week's result; while it is open,
 * the countdown, the parlay and the picks; once it closes, the parlay with its
 * live status and the picks read-only; once results are out, the viewer's week
 * and its winners. The deadline is the database's — the submit controls are
 * hidden outside the window only because a button whose only outcome is an
 * error is the bug `milestones.js` exists to prevent.
 */
export default function PickemsParlayWidget({ ctx }) {
  const { seasonId, season, actualWeek, openTab } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const now = useNow(MINUTE);

  const weekQuery = usePickEmWeek(seasonId, actualWeek);
  const gamesQuery = usePickEmGameData(seasonId, actualWeek);
  const pickEmWeek = weekQuery.data ?? null;
  const pickEmWeekId = pickEmWeek?.id ?? null;
  const state = pickEmWindowState(pickEmWeek, now);
  const closed = isWindowClosed(state);
  const nflSeasonYear = season?.espnSeasonYear ?? season?.espn_season_year ?? season?.year ?? null;

  const userPicksQuery = useUserPicks(pickEmWeekId, { enabled: Boolean(user) });
  // Who has picked, not what they picked: a count, so it is no help in
  // choosing and needs no wait for the window to close the way the split does.
  const allPicksQuery = useAllPicks(pickEmWeekId, { enabled: state.status !== 'upcoming' });
  const parlayPicksQuery = useParlayWeekPicks(pickEmWeekId);
  const countQuery = useApprovedMemberCount();
  const { data: liveData } = useParlayLive(pickEmWeekId, {
    seasonYear: nflSeasonYear,
    weekNumber: actualWeek,
    enabled: closed
  });

  const { submitPicks } = usePickEmMutations(seasonId);
  const submit = useCallback(
    (weekId, picks) => submitPicks.mutateAsync({ pickEmWeekId: weekId, picks }),
    [submitPicks]
  );

  const form = usePickEmForm({
    pickEmWeek,
    games: gamesQuery.data ?? NONE,
    userPicks: userPicksQuery.data ?? NONE,
    userId: user?.id ?? null,
    submit
  });

  const counters = useMemo(
    () =>
      pickemCounters({
        allPicks: allPicksQuery.data ?? NONE,
        parlayPicks: parlayPicksQuery.data ?? NONE,
        memberCount: countQuery.data ?? null
      }),
    [allPicksQuery.data, parlayPicksQuery.data, countQuery.data]
  );

  const loading = weekQuery.isPending || (Boolean(pickEmWeek) && gamesQuery.isPending);

  return (
    <HomeWidget
      id="pickems"
      icon={Target}
      title="Pick'ems & TD parlay"
      aside={<WindowChip state={state} now={now} />}
      to="/pickems"
      toLabel="Open Pick'ems"
      onNavigate={() => openTab?.()}
      loading={loading}
      skeleton={<WidgetSkeleton />}
      error={weekQuery.isError || gamesQuery.isError}
      onRetry={() => {
        weekQuery.refetch();
        gamesQuery.refetch();
      }}
      empty={
        !loading &&
        !pickEmWeek && (
          <p className="text-sm text-muted-foreground">No pick&apos;ems this week.</p>
        )
      }
    >
      <div className="space-y-4">
        {state.status !== 'upcoming' && (
          <p className="text-[13px] text-muted-foreground tabular">{counters.text}</p>
        )}

        {state.status === 'upcoming' && (
          <div className="space-y-1 text-sm">
            <p>
              Picks open{' '}
              <span className="font-medium">
                {state.opensAt.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}
              </span>
              .
            </p>
            <WeekResult seasonId={seasonId} week={actualWeek - 1} label="Last week" />
          </div>
        )}

        {state.status === 'completed' && (
          <WeekResult seasonId={seasonId} week={actualWeek} label="This week" showWinners viewer={{ user, isAdmin, teamOwnerNames }} />
        )}

        <section aria-labelledby="home-parlay-title" className="space-y-2">
          <h3 id="home-parlay-title" className="flex items-center gap-1.5 text-sm font-semibold">
            <Crosshair className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Your TD parlay pick
          </h3>
          <ParlayMyPick
            pickEmWeek={pickEmWeek}
            seasonYear={nflSeasonYear}
            status={state}
            weekNumber={actualWeek}
            liveStatus={liveData?.status}
            idPrefix="home-parlay-player"
          />
        </section>

        {state.status !== 'upcoming' && (gamesQuery.data ?? NONE).length > 0 && (
          <PicksDisclosure
            form={form}
            state={state}
            games={gamesQuery.data ?? NONE}
            viewer={{ user, isAdmin, teamOwnerNames }}
          />
        )}

        {state.status === 'completed' && (
          <Link
            to="/pickems"
            onClick={() => openTab?.()}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
          >
            See the results
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </HomeWidget>
  );
}

/** The header's chip: the countdown while open, then what the week is doing. */
function WindowChip({ state, now }) {
  if (state.status === 'open') {
    const left = formatCountdown(state.closesAt, now);
    return left ? (
      <Badge variant="warning" className="tabular uppercase tracking-[0.04em]">
        Closes in {left}
      </Badge>
    ) : null;
  }
  if (state.status === 'closed') return <Badge variant="secondary" className="uppercase tracking-[0.04em]">Locked</Badge>;
  if (state.status === 'completed') return <Badge variant="outline" className="uppercase tracking-[0.04em]">Results</Badge>;
  if (state.status === 'upcoming') return <Badge variant="secondary" className="uppercase tracking-[0.04em]">Not open</Badge>;
  return null;
}

/**
 * The week's matchups, folded. The rows are the Pick'ems form's own; the bar
 * is the form's submit bar, fitted to the card.
 *
 * While the window is open it lists the games still to pick, as the form
 * does. Once it closes it lists every matchup, read-only, with each finished
 * game's winner marked — the week as it is being decided.
 */
function PicksDisclosure({ form, state, games, viewer }) {
  const [open, setOpen] = useState(false);
  const isOpen = state.status === 'open';
  const rows = isOpen ? form.availableGames : games.filter((game) => !isByeGame(game));
  const total = isOpen ? form.selectableGames.length : rows.length;
  const picked = isOpen ? form.totalPicks : rows.filter((game) => form.picks[game.id]).length;
  const canPick = isOpen && Boolean(viewer.user) && form.canEdit;

  const summary = form.hasSubmitted && !form.isEditing
    ? `submitted, ${picked} of ${total}`
    : `${picked} of ${total}`;

  return (
    <div className="-mx-4 border-t border-border/60">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-sm font-medium transition-colors hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          Your picks
          <span className="font-normal text-muted-foreground tabular">· {summary}</span>
          {form.hasChanges && isOpen && <Badge variant="warning">Draft</Badge>}
          {form.hasSubmitted && !form.isEditing && (
            <CheckCircle2 className="h-4 w-4 text-info" aria-label="Submitted" />
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {form.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{form.error}</AlertDescription>
            </Alert>
          )}
          {form.showConfirmation && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Picks submitted. You can still change them until the deadline.
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((game, index) => (
              <li key={game.id}>
                <PickEmGameRow
                  compact
                  showResult={!isOpen}
                  game={game}
                  number={index + 1}
                  selectedTeamId={form.picks[game.id] ?? null}
                  canPick={canPick}
                  onPick={(teamId) => form.pick(game.id, teamId)}
                  user={viewer.user}
                  isAdmin={viewer.isAdmin}
                  teamOwnerNames={viewer.teamOwnerNames}
                />
              </li>
            ))}
          </ul>

          {isOpen && (
            <PickEmsSubmitBar
              className="-mx-4 px-4 sm:-mx-4 sm:px-4 lg:-mx-4 lg:rounded-none lg:border-x-0 lg:border-b-0"
              totalPicks={form.totalPicks}
              totalGames={total}
              hasSubmitted={form.hasSubmitted}
              isEditing={form.isEditing}
              hasChanges={form.hasChanges}
              submitting={form.submitting}
              user={viewer.user}
              onSubmit={form.handleSubmit}
              onEdit={form.startEdit}
              onCancelEdit={form.cancelEdit}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A scored week, from the viewer's side: "Last week you went 5 of 7, 2nd",
 * and, with `showWinners`, who won it. Renders nothing for a week with no
 * pick'em row or no scores yet.
 */
function WeekResult({ seasonId, week, label, showWinners = false, viewer = null }) {
  const { user } = useViewer();
  const weekQuery = usePickEmWeek(seasonId, week > 0 ? week : null);
  const scoresQuery = useWeeklyPickEmScores(weekQuery.data?.id ?? null);
  const result = useMemo(() => viewerWeekResult(scoresQuery.data ?? NONE, user?.id ?? null), [scoresQuery.data, user]);

  if (scoresQuery.isPending && weekQuery.data) return <Skeleton className="h-4 w-2/3" />;
  if (!scoresQuery.data || result.entrants === 0) return null;

  const { mine, winners } = result;
  return (
    <div className="space-y-1 text-sm">
      {mine ? (
        <p>
          {label} you went{' '}
          <span className="font-semibold tabular">
            {mine.correct} of {mine.decided}
          </span>
          , {mine.tied ? 'T-' : ''}
          {formatOrdinal(mine.place)} of {result.entrants}.
        </p>
      ) : (
        <p className="text-muted-foreground">{label} you didn&apos;t enter.</p>
      )}
      {showWinners && winners.length > 0 && viewer && (
        <p className="text-muted-foreground">
          {winners.length === 1 ? 'Winner' : 'Winners'}:{' '}
          <span className="text-foreground">
            {winners
              .map((w) => getMaskedUserName(w.displayName, w.userId, viewer.user, viewer.isAdmin, viewer.teamOwnerNames))
              .join(', ')}
          </span>
        </p>
      )}
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div role="status" aria-label="Loading pick'ems" className="space-y-3">
      <Skeleton className="h-3.5 w-1/2" />
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
