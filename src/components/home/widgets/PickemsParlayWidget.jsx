import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Crosshair, Target } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { OpponentChip } from '../../ui/opponent-chip';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { formatOrdinal } from '../../../utils/format';
import { getMaskedUserName } from '../../../utils/displayNameUtils';
import { getPositionColor } from '../../../utils/positionColors';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import {
  useAllPicks,
  useApprovedMemberCount,
  useMyParlayPick,
  useNflOpponentMap,
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
import PickEmsSubmitBar from '../../pickems/PickEmsSubmitBar.jsx';
import ParlayMyPick from '../../pickems/ParlayMyPick.jsx';
import { ParlayPickStatus } from '../../pickems/LiveTdIndicator.jsx';
import { isByeGame } from '../../pickems/pickSplit.js';
import { formatCountdown, isWindowClosed, pickEmWindowState } from '../../pickems/pickEmWindow.js';
import { usePickEmForm } from '../../pickems/usePickEmForm.js';
import { pickemCounters, viewerWeekResult } from '../../../../utils/home/pickems.js';

const NONE = [];
const MINUTE = 60_000;

/**
 * The week's pick'ems and TD parlay, as two tiles and one panel.
 *
 * Each tile answers one question at a glance — "are my picks in?", "who is my
 * scorer?" — and carries the league's answer to the same question under it
 * ("12 of 14 picked"). Tapping a tile opens the one panel beneath them to act
 * on it: the week's matchups with the submit bar, or the player picker. One
 * panel at a time, so the card never grows two forms at once.
 *
 * Every read is the Pick'ems tab's own cache entry and every write its own
 * mutation, through the tab's own pieces (`usePickEmForm`, `PickEmGameRow`,
 * `PickEmsSubmitBar`, `ParlayMyPick`), so a selection made here and not yet
 * submitted is on the tab (and survives a reload), and a submission here is on
 * the tab without a refetch of its own.
 *
 * The window is `pickEmWindowState`, the one definition: before it opens the
 * tiles say when; while open they say what is left to do; once closed, what
 * was entered, with the parlay's live status; once scored, how the week went.
 * The deadline is the database's — the controls are hidden outside the window
 * only because a button whose only outcome is an error is the bug
 * `milestones.js` exists to prevent.
 */
export default function PickemsParlayWidget({ ctx }) {
  const { seasonId, season, actualWeek, openTab } = ctx;
  const { user, isAdmin, isApproved, teamOwnerNames } = useViewer();
  const viewer = { user, isAdmin, teamOwnerNames };
  const now = useNow(MINUTE);
  const [panel, setPanel] = useState(null);
  const toggle = (name) => setPanel((current) => (current === name ? null : name));

  const weekQuery = usePickEmWeek(seasonId, actualWeek);
  const gamesQuery = usePickEmGameData(seasonId, actualWeek);
  const pickEmWeek = weekQuery.data ?? null;
  const pickEmWeekId = pickEmWeek?.id ?? null;
  const state = pickEmWindowState(pickEmWeek, now);
  const isOpen = state.status === 'open';
  const closed = isWindowClosed(state);
  const nflSeasonYear = season?.espnSeasonYear ?? season?.espn_season_year ?? season?.year ?? null;

  const userPicksQuery = useUserPicks(pickEmWeekId, { enabled: Boolean(user) });
  // Who has picked, not what they picked: a count is no help in choosing, so
  // it needs no wait for the window to close the way the split does.
  const allPicksQuery = useAllPicks(pickEmWeekId, { enabled: state.status !== 'upcoming' });
  const parlayPicksQuery = useParlayWeekPicks(pickEmWeekId);
  const countQuery = useApprovedMemberCount();
  const { data: myParlay, isLoading: myParlayLoading } = useMyParlayPick(pickEmWeekId);
  const { data: opponents = {} } = useNflOpponentMap(nflSeasonYear, actualWeek);
  const { data: liveData } = useParlayLive(pickEmWeekId, {
    seasonYear: nflSeasonYear,
    weekNumber: actualWeek,
    enabled: closed
  });
  const scoresQuery = useWeeklyPickEmScores(pickEmWeekId, { enabled: state.status === 'completed' });

  const { submitPicks } = usePickEmMutations(seasonId);
  const submit = useCallback(
    (weekId, picks) => submitPicks.mutateAsync({ pickEmWeekId: weekId, picks }),
    [submitPicks]
  );

  const games = gamesQuery.data ?? NONE;
  const form = usePickEmForm({
    pickEmWeek,
    games,
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
  const result = useMemo(
    () => viewerWeekResult(scoresQuery.data ?? NONE, user?.id ?? null),
    [scoresQuery.data, user]
  );

  const loading = weekQuery.isPending || (Boolean(pickEmWeek) && gamesQuery.isPending);
  const weekGames = useMemo(() => games.filter((game) => !isByeGame(game)), [games]);
  const matchupRows = isOpen ? form.availableGames : weekGames;
  const weekPicked = weekGames.filter((game) => form.picks[game.id]).length;

  return (
    <HomeWidget
      id="pickems"
      icon={Target}
      title="Pick'ems & TD Parlay"
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
      empty={!loading && !pickEmWeek && <p className="text-sm text-muted-foreground">No pick&apos;ems this week.</p>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <PicksTile
            state={state}
            form={form}
            result={result}
            counters={counters}
            weekPicked={weekPicked}
            weekTotal={weekGames.length}
            open={panel === 'picks'}
            onToggle={matchupRows.length > 0 && state.status !== 'upcoming' ? () => toggle('picks') : null}
            seasonId={seasonId}
            week={actualWeek}
          />
          <ParlayTile
            state={state}
            pick={myParlay}
            loading={myParlayLoading}
            opponent={myParlay ? opponents[myParlay.player?.proTeamId] : null}
            live={myParlay ? liveData?.status?.[myParlay.id] : null}
            counters={counters}
            open={panel === 'parlay'}
            onToggle={isOpen && isApproved ? () => toggle('parlay') : null}
          />
        </div>

        {state.status === 'completed' && result.winners.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {result.winners.length === 1 ? 'Week winner' : 'Week winners'}:{' '}
            <span className="text-foreground">
              {result.winners
                .map((w) => getMaskedUserName(w.displayName, w.userId, user, isAdmin, teamOwnerNames))
                .join(', ')}
            </span>
          </p>
        )}

        {panel === 'picks' && (
          <PicksPanel form={form} rows={matchupRows} isOpen={isOpen} viewer={viewer} />
        )}

        {panel === 'parlay' && (
          <section aria-label="Your TD parlay pick" className="border-t border-border/60 pt-4">
            <ParlayMyPick
              pickEmWeek={pickEmWeek}
              seasonYear={nflSeasonYear}
              status={state}
              weekNumber={actualWeek}
              liveStatus={liveData?.status}
              idPrefix="home-parlay-player"
              initialEditing
              onDone={() => setPanel(null)}
            />
          </section>
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
 * A tile: a label, one headline figure or name, one line under it, and the
 * league's turnout as a meter at its foot. A button when there is something
 * to open; the panel it opens sits under both tiles.
 */
function Tile({ icon: Icon, label, open, onToggle, headline, sub, meter, children }) {
  const Comp = onToggle ? 'button' : 'div';
  return (
    <Comp
      {...(onToggle ? { type: 'button', onClick: onToggle, 'aria-expanded': open } : {})}
      className={cn(
        'flex min-w-0 flex-col rounded-xl bg-muted/35 p-3.5 text-left ring-1 ring-inset transition-colors',
        open ? 'ring-primary/50 bg-muted/60' : 'ring-border/60',
        onToggle && 'hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        {onToggle && (
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="mt-2 block min-w-0">{headline}</span>
      {sub && <span className="mt-1 block min-w-0 text-xs text-muted-foreground">{sub}</span>}
      {children}
      {meter && <Meter {...meter} />}
    </Comp>
  );
}

/** The league's turnout: "12 of 14 picked", with a bar once the 14 is known. */
function Meter({ count, of, noun }) {
  return (
    <span className="mt-auto block pt-3">
      <span className="block text-[11px] text-muted-foreground tabular">
        {of ? `${count} of ${of} ${noun}` : `${count} ${noun}`}
      </span>
      {of ? (
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-background/60" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-foreground/45"
            style={{ width: `${Math.min(100, (count / of) * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

const Figure = ({ children, className }) => (
  <span className={cn('block font-display text-[30px] font-semibold leading-none tracking-[-0.01em] tabular', className)}>
    {children}
  </span>
);

function PicksTile({ state, form, result, counters, weekPicked, weekTotal, open, onToggle, seasonId, week }) {
  const total = form.selectableGames.length;
  const meter = state.status === 'upcoming' ? null : { count: counters.picked, of: counters.of, noun: 'picked' };

  let headline;
  let sub;
  if (state.status === 'upcoming') {
    headline = (
      <Figure className="text-[22px]">
        Opens {state.opensAt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
      </Figure>
    );
    sub = <LastWeek seasonId={seasonId} week={week - 1} />;
  } else if (state.status === 'completed' && result.mine) {
    headline = (
      <Figure>
        {result.mine.correct}
        <span className="text-muted-foreground">/{result.mine.decided}</span>
      </Figure>
    );
    sub = `${result.mine.tied ? 'T-' : ''}${formatOrdinal(result.mine.place)} of ${result.entrants}`;
  } else if (form.hasSubmitted && !form.isEditing) {
    headline = (
      <Figure>
        {weekPicked}
        <span className="text-muted-foreground">/{weekTotal}</span>
      </Figure>
    );
    sub = (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {state.status === 'open' ? 'Submitted' : 'Locked in'}
      </span>
    );
  } else if (state.status === 'open') {
    headline = (
      <Figure>
        {form.totalPicks}
        <span className="text-muted-foreground">/{total}</span>
      </Figure>
    );
    sub = (
      <span className={cn(form.hasChanges ? 'text-warning' : 'text-primary')}>
        {form.hasChanges ? 'Draft — not submitted' : 'Not submitted yet'}
      </span>
    );
  } else {
    headline = <Figure className="text-muted-foreground">—</Figure>;
    sub = 'No picks this week';
  }

  return (
    <Tile
      icon={Target}
      label="Pick'ems"
      open={open}
      onToggle={onToggle}
      headline={headline}
      sub={sub}
      meter={meter}
    />
  );
}

function ParlayTile({ state, pick, loading, opponent, live, counters, open, onToggle }) {
  const meter = state.status === 'upcoming' ? null : { count: counters.parlays, of: counters.of, noun: 'parlays in' };
  const revealed = isWindowClosed(state);

  let headline;
  let sub = null;
  if (loading) {
    // A span, not `Skeleton`'s div: the tile may be a button.
    headline = <span className="block h-6 w-3/4 animate-pulse rounded-md bg-muted" aria-hidden="true" />;
  } else if (pick) {
    headline = (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[17px] font-semibold leading-tight" title={pick.playerNameRaw}>
          {pick.playerNameRaw}
        </span>
        {revealed && <ParlayPickStatus scoredTd={pick.scoredTd} live={live} compact />}
      </span>
    );
    sub = (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {pick.player?.position && (
          <span
            className={cn(
              'rounded px-1 py-px text-[10px] font-semibold uppercase tracking-[0.06em]',
              getPositionColor(pick.player.position)
            )}
          >
            {pick.player.position}
          </span>
        )}
        {pick.player?.teamAbbreviation && <span>{pick.player.teamAbbreviation}</span>}
        <OpponentChip entry={opponent} warnOnBye />
      </span>
    );
  } else if (state.status === 'open') {
    headline = <span className="block text-[17px] font-semibold leading-tight text-primary">Pick a scorer</span>;
    sub = 'One player to score a TD';
  } else if (state.status === 'upcoming') {
    headline = <span className="block text-[17px] font-semibold leading-tight">Opens with pick&apos;ems</span>;
  } else {
    headline = <span className="block text-[17px] font-semibold leading-tight text-muted-foreground">No pick</span>;
  }

  return (
    <Tile
      icon={Crosshair}
      label="TD Parlay"
      open={open}
      onToggle={onToggle}
      headline={headline}
      sub={sub}
      meter={meter}
    />
  );
}

/**
 * The week's matchups, under the tiles. The rows are the Pick'ems form's own;
 * the bar is the form's submit bar, fitted to the card. While the window is
 * open it lists the games still to pick; once it closes, every matchup,
 * read-only, with each finished game's winner marked.
 */
function PicksPanel({ form, rows, isOpen, viewer }) {
  const canPick = isOpen && Boolean(viewer.user) && form.canEdit;
  return (
    <section aria-label="Your picks" className="space-y-3 border-t border-border/60 pt-4">
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
          totalGames={form.selectableGames.length}
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
    </section>
  );
}

/** "Last week 5/7 · 2nd", under the opening time. Nothing without a score. */
function LastWeek({ seasonId, week }) {
  const { user } = useViewer();
  const weekQuery = usePickEmWeek(seasonId, week > 0 ? week : null);
  const scoresQuery = useWeeklyPickEmScores(weekQuery.data?.id ?? null);
  const { mine } = useMemo(() => viewerWeekResult(scoresQuery.data ?? NONE, user?.id ?? null), [scoresQuery.data, user]);
  if (!mine) return null;
  return (
    <span className="tabular">
      Last week {mine.correct}/{mine.decided} · {mine.tied ? 'T-' : ''}
      {formatOrdinal(mine.place)}
    </span>
  );
}

function WidgetSkeleton() {
  return (
    <div role="status" aria-label="Loading pick'ems" className="grid grid-cols-2 gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-xl bg-muted/35 p-3.5" aria-hidden="true">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-1 w-full" />
        </div>
      ))}
    </div>
  );
}
