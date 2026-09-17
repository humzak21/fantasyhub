import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crosshair, Check, X } from 'lucide-react';

import PageHeader from '../layout/PageHeader';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ScrollHint } from '../ui/scroll-hint';
import RouteLoading from '../layout/RouteLoading';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useAllPickEmWeeks,
  useDivisions,
  useSeasonParlayPicks,
  useSeasonTeams
} from '../../../hooks/queries/index.js';
import { getDb } from '../../../services/db/index.js';
import { groupPicksByDivision } from '../../utils/parlayDivisions';
import { parlayHitRate } from './hitRate.js';
import { getPositionColor } from '../../utils/positionColors';

/**
 * The parlay commissioner's view: everyone's picks, by week and across the
 * season.
 *
 * Read-only, and not because the UI omits the buttons — `td_parlay_picks` has
 * no write policy naming the commissioner, so a hand-rolled request from this
 * page would be refused. The absence of controls here is a description of that,
 * not the enforcement of it.
 *
 * Real names appear here and only here. The masking helpers everywhere else
 * take `isAdmin`; this page passes `true` in that position because the whole
 * point of the page is knowing who picked what. That substitution stays local —
 * folding the commissioner into the global `isAdmin` would unmask the entire
 * league to them and hand them the admin's write paths besides.
 */
/**
 * Shared empty arrays for the `data = []` defaults below.
 *
 * Not a micro-optimisation: a fresh `[]` per render feeds the `userIds` memo a
 * new identity every time, which re-runs the display-name effect, which sets
 * state, which renders again — an infinite loop that only appears while a
 * query is still pending, i.e. on every first paint.
 */
const NO_PICKS = [];
const NO_WEEKS = [];
const NO_ROWS = [];

const ParlayCommissionerDashboard = ({ season, embedded = false }) => {
  const { isAdmin, isParlayCommissioner, isParlayCommissionerLoading } = useViewer();
  const seasonId = season?.id ?? null;

  const { data: weeks = NO_WEEKS, isLoading: weeksLoading } = useAllPickEmWeeks(seasonId);
  const { data: picks = NO_PICKS, isLoading: picksLoading } = useSeasonParlayPicks(seasonId);

  // The week's board is split by division, the same way the picks appear on
  // the Make Picks page — the league runs one parlay per division, so a flat
  // list of everyone's picks is not the shape of the competition. Which column
  // a pick belongs in is derived from the member's name matching a
  // `teams.owner`; see `utils/parlayDivisions.js`. Both hooks share the cache
  // entries the shell has already filled, so neither costs a request here.
  const { data: teams = NO_ROWS } = useSeasonTeams(seasonId);
  const { data: divisions = NO_ROWS } = useDivisions(seasonId);

  const [selectedWeek, setSelectedWeek] = useState(null);
  const [displayNames, setDisplayNames] = useState({});

  // Names are not on the pick rows — `user_id` is a uuid and auth.users is not
  // readable from the client. `get_user_display_names` is the public-safe RPC
  // the rest of the app already uses for exactly this.
  // Sorted and joined, so the effect's dependency is a *value* rather than an
  // array identity — the same set of members in a different order must not
  // count as a change worth re-fetching for.
  const userIdKey = useMemo(
    () => [...new Set(picks.map((pick) => pick.userId).filter(Boolean))].sort().join(','),
    [picks]
  );

  useEffect(() => {
    if (!userIdKey) return;

    let cancelled = false;
    getDb()
      .users.getUserDisplayNames(userIdKey.split(','))
      .then((names) => {
        if (!cancelled) setDisplayNames(names);
      })
      .catch(() => {
        // A missing name renders as a uuid stub, not as a broken page.
        if (!cancelled) setDisplayNames({});
      });

    return () => {
      cancelled = true;
    };
  }, [userIdKey]);

  const weekNumbers = useMemo(
    () => weeks.map((week) => week.weekNumber).sort((a, b) => a - b),
    [weeks]
  );

  // Default to the latest week that anyone actually entered — the commissioner
  // opens this page to grade the week just gone, not week 1.
  const latestWeekWithPicks = useMemo(() => {
    const weeksWithPicks = picks.map((pick) => pick.week);
    return weeksWithPicks.length > 0 ? Math.max(...weeksWithPicks) : null;
  }, [picks]);

  const activeWeek = selectedWeek ?? latestWeekWithPicks ?? weekNumbers.at(-1) ?? null;

  const nameFor = useCallback(
    (userId) => displayNames[userId] ?? `User ${String(userId).slice(0, 8)}`,
    [displayNames]
  );

  // `groupPicksByDivision` matches on `displayName`, which the season query
  // does not carry — the names are resolved separately above — so they are
  // attached here rather than the grouping being taught a second way in.
  const weekPicks = useMemo(
    () =>
      picks
        .filter((pick) => pick.week === activeWeek)
        .map((pick) => ({ ...pick, displayName: nameFor(pick.userId) }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [picks, activeWeek, nameFor]
  );

  const { groups, unassigned } = useMemo(
    () => groupPicksByDivision(weekPicks, { teams, divisions }),
    [weekPicks, teams, divisions]
  );

  if (!season) {
    return (
      <EmptyState
        icon={Crosshair}
        title="No active season"
        description="The parlay dashboard follows the active season."
      />
    );
  }

  if (isParlayCommissionerLoading || weeksLoading || picksLoading) {
    return <RouteLoading />;
  }

  if (!isAdmin && !isParlayCommissioner) {
    return (
      <EmptyState
        icon={Crosshair}
        title="Not available"
        description="This page is for the league's parlay commissioner."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* `embedded` is the pick'ems tab, which already carries a page header —
          a second one under it would title the page twice. The season and the
          commissioner badge still have to say themselves somewhere, so they
          move into a line rather than being dropped. */}
      {embedded ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {`Every member's touchdown pick, ${season.name || season.year}.`}
          </p>
          {!isAdmin && <Badge variant="info">Commissioner</Badge>}
        </div>
      ) : (
        <PageHeader
          icon={Crosshair}
          title="TD Parlay"
          description={`Every member's touchdown pick, ${season.name || season.year}.`}
          badge={
            !isAdmin ? <Badge variant="info">Commissioner</Badge> : null
          }
        />
      )}

      {weekNumbers.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="No pick'em weeks yet"
          description="The parlay follows the pick'ems schedule; create a week to open it."
        />
      ) : (
        <>
          <WeekSelector
            weeks={weekNumbers}
            active={activeWeek}
            counts={picks.reduce((acc, pick) => {
              acc[pick.week] = (acc[pick.week] ?? 0) + 1;
              return acc;
            }, {})}
            onSelect={setSelectedWeek}
          />

          <WeekBoard
            week={activeWeek}
            groups={groups}
            unassigned={unassigned}
            total={weekPicks.length}
          />

          <SeasonGrid
            weeks={weekNumbers}
            picks={picks}
            nameFor={nameFor}
          />
        </>
      )}
    </div>
  );
};

/**
 * The week picker.
 *
 * A row of buttons rather than a `Select`: there are ~14 of them, the
 * commissioner moves between adjacent weeks constantly, and the count under
 * each one is the thing they are looking for. It scrolls sideways on a phone
 * inside a ScrollHint — never `justify-center`, which pushes the start of an
 * overflowing row to a scroll offset that cannot be reached.
 */
const WeekSelector = ({ weeks, active, counts, onSelect }) => (
  <ScrollHint>
    <div className="flex gap-2 pb-1">
      {weeks.map((week) => (
        <Button
          key={week}
          size="sm"
          variant={week === active ? 'default' : 'outline'}
          onClick={() => onSelect(week)}
          className="shrink-0"
        >
          Wk {week}
          <span className="ml-1.5 text-xs opacity-70">{counts[week] ?? 0}</span>
        </Button>
      ))}
    </div>
  </ScrollHint>
);

/**
 * The week's picks, a column per division.
 *
 * The same shape as the board on the Make Picks page, and for the same reason:
 * the league runs one parlay per division, so seven picks in one column is the
 * unit that either hits or does not. A flat table sorted by name put two
 * different competitions in one list and left the commissioner counting rows
 * to see whether a parlay was complete.
 *
 * Division names are real here, like every other name on this page. Empty
 * columns still render — "nobody in Division 2 has entered yet" is the answer
 * to the question this page is open for.
 */
const WeekBoard = ({ week, groups, unassigned, total }) => {
  if (total === 0 && groups.length === 0) {
    return (
      <Card>
        <CardContent className="p-3 sm:p-4">
          <EmptyState
            icon={Crosshair}
            title={`Nobody entered week ${week}`}
            description="Picks appear here as they are submitted."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Week {week}</h3>
          <span className="text-xs text-muted-foreground">
            {total} {total === 1 ? 'pick' : 'picks'} in
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group, index) => (
            <DivisionColumn
              key={group.division?.id ?? index}
              title={group.division?.name || `Division ${index + 1}`}
              picks={group.picks}
              emptyText="Nobody in this division has entered yet."
            />
          ))}

          {unassigned.length > 0 && (
            <DivisionColumn
              className="md:col-span-2"
              title="Not matched to a division"
              picks={unassigned}
              emptyText="Nobody in this division has entered yet."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/** One division's parlay: its name, and every pick entered against it. */
const DivisionColumn = ({ className, title, picks, emptyText }) => (
  <section
    aria-label={title}
    className={cn('rounded-lg border border-border bg-muted/20 p-3', className)}
  >
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <h4 className="truncate text-sm font-semibold text-foreground">{title}</h4>
      <span className="shrink-0 text-xs tabular text-muted-foreground">{picks.length}</span>
    </div>

    {picks.length === 0 ? (
      <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-border">
        {picks.map((pick) => (
          <li key={pick.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{pick.displayName}</span>
            <span className="truncate">{pick.playerNameRaw}</span>
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
            {/* A free-text pick is flagged because it is the one the
                commissioner has to look up by hand — no player row means no
                auto-grading either. */}
            {!pick.playerId && (
              <Badge variant="outline" className="text-[10px]">
                unmatched
              </Badge>
            )}
            <GradeCell scoredTd={pick.scoredTd} />
            <span className="w-full tabular text-[11px] text-muted-foreground">
              {pick.submittedAt
                ? `Submitted ${new Date(pick.submittedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}`
                : 'Submission time unknown'}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

/**
 * Members down, weeks across.
 *
 * The one view that answers "who keeps forgetting" and "how is everyone
 * doing", which a per-week table cannot. Genuinely wide — 14 weeks — so it
 * scrolls in its own container with the member column pinned; the reader loses
 * their row the moment the name leaves the viewport.
 */
const SeasonGrid = ({ weeks, picks, nameFor }) => {
  const byUser = useMemo(() => {
    const map = new Map();
    for (const pick of picks) {
      if (!map.has(pick.userId)) map.set(pick.userId, {});
      map.get(pick.userId)[pick.week] = pick;
    }
    return [...map.entries()].sort((a, b) => nameFor(a[0]).localeCompare(nameFor(b[0])));
  }, [picks, nameFor]);

  if (byUser.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <h3 className="mb-3 text-base font-semibold text-foreground">
          Season at a glance
        </h3>

        <ScrollHint>
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left text-[13px] font-medium text-muted-foreground">
                  Member &middot; TDs hit
                </th>
                {weeks.map((week) => (
                  <th
                    key={week}
                    className="px-2 py-1.5 text-center text-[13px] font-medium text-muted-foreground"
                  >
                    {week}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byUser.map(([userId, weekMap]) => (
                <tr key={userId}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-t border-border bg-card px-2 py-1.5 font-medium">
                    <span className="flex items-baseline gap-2">
                      <span>{nameFor(userId)}</span>
                      <HitRate picks={Object.values(weekMap)} />
                    </span>
                  </td>
                  {weeks.map((week) => {
                    const pick = weekMap[week];
                    return (
                      <td
                        key={week}
                        className="whitespace-nowrap border-t border-border px-2 py-1.5 text-center"
                        title={pick?.playerNameRaw ?? undefined}
                      >
                        {pick ? (
                          <span className="flex items-center justify-center gap-1">
                            <span className="max-w-[7rem] truncate text-xs">
                              {abbreviateName(pick.playerNameRaw)}
                            </span>
                            <GradeMark scoredTd={pick.scoredTd} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollHint>
      </CardContent>
    </Card>
  );
};

/** The rate beside a member's name in the grid. See `hitRate.js`. */
const HitRate = ({ picks }) => {
  const rate = parlayHitRate(picks);

  if (!rate) {
    return (
      <span className="text-[11px] text-muted-foreground" title="Nothing graded yet">
        &mdash;
      </span>
    );
  }

  return (
    <span
      className="text-[11px] tabular text-muted-foreground"
      title={`${rate.hits} of ${rate.graded} graded picks scored`}
    >
      {rate.hits}/{rate.graded} &middot; {rate.percent.toFixed(0)}%
    </span>
  );
};

/** "Justin Jefferson" → "J. Jefferson". A grid cell has no room for both names. */
const abbreviateName = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
};

/**
 * The grade, as its own component on purpose.
 *
 * Grading happens in SQL today. When it becomes a control — an admin toggle, or
 * a sync step's output — this is the one place that changes, in both the table
 * and the grid.
 */
const GradeCell = ({ scoredTd }) => {
  if (scoredTd === true) return <Badge variant="success">TD</Badge>;
  if (scoredTd === false) return <Badge variant="destructive">No TD</Badge>;
  return <Badge variant="secondary">Ungraded</Badge>;
};

const GradeMark = ({ scoredTd }) => {
  if (scoredTd === true) {
    return <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Scored" />;
  }
  if (scoredTd === false) {
    return <X className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="No touchdown" />;
  }
  return (
    <span className="shrink-0 text-xs text-muted-foreground" aria-label="Ungraded">
      &middot;
    </span>
  );
};

export default ParlayCommissionerDashboard;
