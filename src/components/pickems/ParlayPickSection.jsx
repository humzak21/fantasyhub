import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Check, X, Loader2, Lock, Pencil, AlertCircle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { EmptyState } from '../ui/empty-state';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useDebouncedValue } from '../../hooks/use-debounced-value.js';
import {
  useDivisions,
  useMyParlayPick,
  useNflOpponentMap,
  useParlayWeekPicks,
  usePlayerSearch,
  useSeasonTeams,
  useSubmitParlayPick
} from '../../../hooks/queries/index.js';
import { getMaskedDivisionName, getMaskedUserName } from '../../utils/displayNameUtils';
import { groupPicksByDivision } from '../../utils/parlayDivisions';
import { getPositionColor } from '../../utils/positionColors';
import { OpponentChip } from '../ui/opponent-chip';

/**
 * The weekly TD parlay, at the foot of the pick'ems form.
 *
 * It is deliberately not its own page and not its own deadline. `status` is the
 * *same object* PickEmsSubmission computed for the pick'ems above — passing it
 * down rather than recomputing it is what guarantees the two windows cannot
 * drift apart, and returning null without a `pickEmWeek` is what makes "the
 * parlay exists only when pick'ems is activated" true rather than aspirational.
 *
 * Three things are the database's job, not this component's:
 *   - the deadline (`submit_td_parlay_pick` raises outside the window),
 *   - who may see whose pick (RLS on `td_parlay_picks` — everyone, always,
 *     since `20260902150000_parlay_picks_visible_as_submitted`),
 *   - the canonical player name on a matched pick.
 * So the UI here can be naive about all three, and a bug in it leaks nothing.
 *
 * The board below the picker shows the league's picks as they are submitted
 * rather than holding them to the deadline, in two columns — one per division,
 * because the league runs one parlay per division. The column a pick belongs in
 * is derived, not stored; see `utils/parlayDivisions.js`.
 */
/**
 * One shared empty array for the `data = []` defaults below.
 *
 * A fresh `[]` per render is a new identity every render, which re-runs the
 * grouping memo on every keystroke in the picker above it.
 */
const EMPTY = [];

const ParlayPickSection = ({ pickEmWeek, seasonYear = null, status, weekNumber }) => {
  // `isApproved` gates the form; `isAuthenticated` only chooses the copy —
  // a signed-in member the admin has not approved yet is told so, rather
  // than being asked to sign in again.
  const { user, isAuthenticated, isApproved, isAdmin, teamOwnerNames } = useViewer();

  const isOpen = status?.status === 'open';
  const isRevealed = status?.status === 'closed' || status?.status === 'completed';

  const { data: myPick, isLoading: myPickLoading } = useMyParlayPick(pickEmWeek?.id);

  // Everyone's picks, whatever the week's state. There is nothing to gate on:
  // the picks are public from the moment they are submitted, and the row filter
  // that used to withhold them is gone.
  const { data: leaguePicks = EMPTY } = useParlayWeekPicks(pickEmWeek?.id);

  // The division a pick sits in is derived from the member's name matching a
  // `teams.owner`, so the board needs both halves of the league's identity.
  // Both hooks share the cache entries `useLeagueData` has already filled at
  // the app root, so this costs no request of its own.
  const seasonId = pickEmWeek?.seasonId ?? null;
  const { data: teams = EMPTY } = useSeasonTeams(seasonId);
  const { data: divisions = EMPTY } = useDivisions(seasonId);

  const { groups, unassigned } = useMemo(
    () => groupPicksByDivision(leaguePicks, { teams, divisions }),
    [leaguePicks, teams, divisions]
  );

  // Who each NFL team plays this week, for the "vs BUF" / "@ KC" / "BYE" chips
  // on the current pick and on every autocomplete row. One fetch for the whole
  // season, shared by both — see `hooks/queries/useNflSchedule.js`.
  const { data: opponents = {} } = useNflOpponentMap(seasonYear, weekNumber);

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(null);

  const submit = useSubmitParlayPick(pickEmWeek?.seasonId ?? null);

  // A week with no pick'em row has no parlay. Not an empty state — there is
  // nothing here to have a state about.
  if (!pickEmWeek) return null;

  const handleSubmit = async ({ playerId, playerName }) => {
    setError(null);
    try {
      await submit.mutateAsync({ pickEmWeekId: pickEmWeek.id, playerId, playerName });
      setIsEditing(false);
    } catch (err) {
      setError(err?.message || 'Could not save your pick.');
    }
  };

  const showPicker = isOpen && isApproved && (!myPick || isEditing);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="h-5 w-5" />
              Weekly TD Parlay
            </CardTitle>
            <CardDescription>
              Pick one player on your opponents team this week that you think will
              score a TD. Proceeds go to the league fund for anything and
              everything og jits.
            </CardDescription>
            <CardDescription className="mt-1.5">
              Parlays are separated into divisions, 7 picks per each parlay.
            </CardDescription>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant={isOpen ? 'default' : isRevealed ? 'outline' : 'secondary'}>
              {isOpen ? 'Open' : isRevealed ? 'Locked' : 'Not open yet'}
            </Badge>
            {status?.timeInfo && (
              <span className="text-xs text-muted-foreground">{status.timeInfo}</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!isApproved && (
          <p className="text-sm text-muted-foreground">
            {isAuthenticated
              ? 'Your account is awaiting approval before you can enter the parlay.'
              : isOpen
                ? 'Sign in to enter this week’s parlay.'
                : 'Sign in to see your parlay picks.'}
          </p>
        )}

        {isApproved && !myPickLoading && myPick && !isEditing && (
          <CurrentPick
            pick={myPick}
            opponent={opponents[myPick.player?.proTeamId]}
            canEdit={isOpen}
            onEdit={() => setIsEditing(true)}
            showGrade={isRevealed}
          />
        )}

        {isApproved && !isOpen && !myPickLoading && !myPick && (
          <p className="text-sm text-muted-foreground">
            {status?.status === 'upcoming'
              ? 'The parlay opens with pick’ems.'
              : 'You did not enter a player this week.'}
          </p>
        )}

        {showPicker && (
          <PlayerPicker
            key={myPick?.id ?? 'new'}
            initialQuery={isEditing ? myPick?.playerNameRaw ?? '' : ''}
            opponents={opponents}
            submitting={submit.isPending}
            onCancel={isEditing ? () => setIsEditing(false) : null}
            onSubmit={handleSubmit}
          />
        )}

        <LeaguePicks
          groups={groups}
          unassigned={unassigned}
          total={leaguePicks.length}
          showGrades={isRevealed}
          viewer={{ user, isAdmin, teamOwnerNames }}
        />
      </CardContent>
    </Card>
  );
};

/** The pick as stored, with its grade once the week is graded. */
const CurrentPick = ({ pick, opponent, canEdit, onEdit, showGrade }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate font-semibold">{pick.playerNameRaw}</span>
        {pick.player?.position && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
              getPositionColor(pick.player.position)
            )}
          >
            {pick.player.position}
          </span>
        )}
        {pick.player?.teamAbbreviation && (
          <span className="text-xs text-muted-foreground">{pick.player.teamAbbreviation}</span>
        )}
        <OpponentChip entry={opponent} warnOnBye />
        {!pick.playerId && (
          <Badge variant="outline" className="text-[10px]">
            Not in our player list
          </Badge>
        )}
      </div>
      {showGrade && <GradeBadge scoredTd={pick.scoredTd} className="mt-2" />}
    </div>

    {canEdit ? (
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Change
      </Button>
    ) : (
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    )}
  </div>
);

/** ✓ TD / ✗ No TD / Pending. NULL is ungraded, not "no touchdown". */
const GradeBadge = ({ scoredTd, className }) => {
  if (scoredTd === true) return <Badge variant="success" className={className}>Scored a TD</Badge>;
  if (scoredTd === false) return <Badge variant="destructive" className={className}>No TD</Badge>;
  return <Badge variant="secondary" className={className}>Pending</Badge>;
};

/**
 * Name entry: autocomplete over the synced `players` table, with the typed text
 * itself as a fallback.
 *
 * The fallback is not a nicety. `players` only holds people ESPN has put on a
 * roster in this league, so a fringe goal-line back — exactly the kind of pick
 * this parlay invites — may genuinely not be there, and an autocomplete that
 * cannot be overridden would make him unpickable.
 *
 * The suggestion list is an absolutely-positioned `role="listbox"` rather than
 * a Popover: a popover moves focus, and on touch that fights the on-screen
 * keyboard — the list closes as the keyboard opens.
 */
const PlayerPicker = ({ initialQuery, opponents = {}, submitting, onSubmit, onCancel }) => {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [selected, setSelected] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const blurTimer = useRef(null);

  // The blur close is deferred (see `onBlur` below), so it has to be cancelled
  // on unmount — otherwise a timer fires 150ms after the section is gone and
  // calls setState on a component that no longer exists.
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const debounced = useDebouncedValue(query, 250);
  const { data: matches = [], isFetching } = usePlayerSearch(debounced, {
    enabled: isFocused && !selected
  });

  // A stale highlight from the previous term would send Enter to the wrong row.
  useEffect(() => setActiveIndex(-1), [debounced]);

  const trimmed = query.trim();
  const canSubmit = Boolean(selected) || trimmed.length > 0;
  const showList = isFocused && !selected && trimmed.length >= 2;

  const freeTextOnly = useMemo(
    () => showList && !isFetching && matches.length === 0,
    [showList, isFetching, matches.length]
  );

  const choose = (player) => {
    setSelected(player);
    setQuery(player.name);
    setIsFocused(false);
  };

  const handleKeyDown = (event) => {
    if (!showList || matches.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsFocused(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor="parlay-player" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Your player
        </label>
        <Input
          id="parlay-player"
          value={query}
          placeholder="Start typing a name…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls="parlay-player-suggestions"
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            // Typing after choosing means they changed their mind; the id must
            // not survive its own name.
            setSelected(null);
          }}
          onFocus={() => setIsFocused(true)}
          // A click on a suggestion blurs the input first, so closing on blur
          // immediately would unmount the row before its handler runs.
          onBlur={() => {
            clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => setIsFocused(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />

        {showList && (
          <ul
            id="parlay-player-suggestions"
            role="listbox"
            aria-label="Player suggestions"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]"
          >
            {matches.map((player, index) => (
              <li key={player.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  // `onMouseDown`, not `onClick`: the input's blur fires first
                  // on a click and the list would be gone by then.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(player);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm pointer-coarse:py-3',
                    index === activeIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{player.name}</span>
                  {player.position && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
                        getPositionColor(player.position)
                      )}
                    >
                      {player.position}
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                    {player.teamAbbreviation ?? ''}
                  </span>
                  <OpponentChip entry={opponents[player.proTeamId]} className="w-14" />
                  {player.injuryStatus && player.injuryStatus !== 'ACTIVE' && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-warning"
                      title={player.injuryStatus}
                      aria-label={`Injury status ${player.injuryStatus}`}
                    />
                  )}
                </button>
              </li>
            ))}

            {isFetching && matches.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted-foreground">Searching…</li>
            )}

            {freeTextOnly && (
              <li className="px-2 py-2 text-sm text-muted-foreground">
                No match. Submit to use &ldquo;{trimmed}&rdquo; as written.
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => onSubmit({ playerId: selected?.id ?? null, playerName: trimmed })}
          disabled={!canSubmit || submitting}
        >
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Lock in pick
        </Button>

        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}

        {!selected && trimmed.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Saved as typed &mdash; not matched to a synced player.
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * The league's picks, in a column per division.
 *
 * Live, not revealed: a pick appears here the moment it is submitted, which is
 * what `20260902150000_parlay_picks_visible_as_submitted` made true in the only
 * place it could be true — the row filter. This component holds nothing back.
 *
 * Every division gets a column even before anybody has entered it, so the board
 * has the same shape on Tuesday morning as it does on Sunday, and a reader can
 * see at a glance who in *their* parlay is still missing.
 *
 * `unassigned` is rendered rather than dropped. It is a member whose display
 * name matches no `teams.owner` — a real state, since the name is theirs to
 * type — and putting them in a division we guessed at would misreport who is
 * competing with whom.
 */
const LeaguePicks = ({ groups, unassigned, total, showGrades, viewer }) => {
  const hasDivisions = groups.length > 0;

  return (
    <div className="border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          The league&rsquo;s picks
        </h4>
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? 'pick' : 'picks'} in
        </span>
      </div>

      {total === 0 && !hasDivisions ? (
        <EmptyState
          icon={Crosshair}
          title="No picks yet"
          description="Picks show up here as they are submitted."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group, index) => (
            <DivisionColumn
              key={group.division?.id ?? index}
              title={getMaskedDivisionName(
                group.division,
                index,
                viewer.user,
                viewer.isAdmin,
                viewer.teamOwnerNames
              )}
              picks={group.picks}
              showGrades={showGrades}
              viewer={viewer}
              emptyText="Nobody in this division has picked yet."
            />
          ))}

          {unassigned.length > 0 && (
            <DivisionColumn
              // Full width under the two columns: it is a footnote about names
              // that did not match, not a third parlay.
              className="md:col-span-2"
              title="Not matched to a division"
              picks={unassigned}
              showGrades={showGrades}
              viewer={viewer}
            />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * One division's parlay: its name, and the picks entered against it.
 *
 * A labelled `<section>` rather than a `<div>`, so each column is a named
 * region — a screen reader reaching "Bijan Robinson" can be told which parlay
 * it belongs to, which is the only thing the two-column layout conveys and the
 * one thing a linear read of a flat list would lose.
 */
const DivisionColumn = ({ className, title, picks, showGrades, viewer, emptyText }) => (
  <section
    aria-label={title}
    className={cn('rounded-lg border border-border bg-muted/20 p-3', className)}
  >
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <h5 className="truncate text-xs font-semibold uppercase tracking-[0.06em]">{title}</h5>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{picks.length}</span>
    </div>

    {picks.length === 0 ? (
      <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-border">
        {picks.map((pick) => (
          <li key={pick.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {getMaskedUserName(
                pick.displayName,
                pick.userId,
                viewer.user,
                viewer.isAdmin,
                viewer.teamOwnerNames
              )}
            </span>
            <span className="truncate font-medium">{pick.playerNameRaw}</span>
            {pick.player?.position && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
                  getPositionColor(pick.player.position)
                )}
              >
                {pick.player.position}
              </span>
            )}
            {/* A grade before the week has played would be a claim about a game
                nobody has watched; ungraded renders as the em dash either way. */}
            {showGrades && <GradeIcon scoredTd={pick.scoredTd} />}
          </li>
        ))}
      </ul>
    )}
  </section>
);

/** The compact grade, for a list where a full badge per row would be noise. */
const GradeIcon = ({ scoredTd }) => {
  if (scoredTd === true) {
    return <Check className="h-4 w-4 shrink-0 text-success" aria-label="Scored a touchdown" />;
  }
  if (scoredTd === false) {
    return <X className="h-4 w-4 shrink-0 text-destructive" aria-label="No touchdown" />;
  }
  return (
    <span className="shrink-0 text-xs text-muted-foreground" aria-label="Not yet graded">
      &mdash;
    </span>
  );
};

export default ParlayPickSection;
