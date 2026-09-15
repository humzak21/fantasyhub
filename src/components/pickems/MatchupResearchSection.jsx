import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { OpponentChip } from '../ui/opponent-chip';
import { PlayerPoints } from '../ui/player-points';
import RouteLoading from '../layout/RouteLoading';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useCurrentLineups, useNflOpponentMap } from '../../../hooks/queries/index.js';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { getPositionColor } from '../../utils/positionColors';
import { isUserTeam, getUserTeamHighlightClasses } from '../../utils/userTeamUtils';
import { isScoringStarter, starterTotal, totalAsPoints } from '../../../utils/lineupTotals.js';

/**
 * Who is actually starting this week, so a parlay pick is a decision rather
 * than a guess.
 *
 * Every matchup is listed, and each one folds open to its two lineups. The
 * list used to sit behind a second toggle of its own — "Research matchups" —
 * on the reasoning that most visits are here to click two buttons and leave.
 * In practice it was a tedious extra click on the way to the thing people
 * came to compare, so the outer toggle is gone and the matchups are always in
 * view. The per-matchup fold stays, because fourteen teams' rosters are over
 * two hundred rows and nobody reads all of them; each row now says "Lineups"
 * next to its chevron so it reads as a disclosure rather than a label.
 *
 * An opened matchup shows each whole roster — starters in lineup order, then
 * the bench, then IR, the grouping Schedule's lineup panel uses. It used to
 * filter to starters, which hid the depth behind a questionable starter, the
 * thing a reader researching a pick most wants to see. The header total still
 * counts starters only: bench points are not the team's.
 *
 * The player query runs as soon as there are games to research.
 *
 * The lineups come from the live `rosters` snapshot, not from
 * `player_week_stats`. That distinction is the whole point: this panel asks a
 * present-tense question, and `player_week_stats` is a historical fact table
 * the cron writes once a week, so it answers with a roster that has since
 * taken waivers and changed its lineup. Reading it here meant that on
 * 2026-08-31 the panel named 122 of its 125 starters wrongly — its newest rows
 * predated the draft.
 *
 * Points are layered onto that roster in order of how much they know: this
 * week's actual points once the sync has them, then this week's projection,
 * then the rolling projection the roster sync refreshes. A starter with no
 * figure at all still appears, with a dash — see
 * `services/db/rosters.js::getCurrentLineupsForWeek`. A figure that is still a
 * projection is labelled "proj" rather than merely dimmed — see
 * `ui/player-points.jsx` — because a guess and a result are two different
 * claims and a shade cannot carry that difference.
 *
 * Each starter also carries their NFL opponent, joined from `nfl_schedule` on
 * `proTeamId`. A starter on a bye is the most actionable thing this panel can
 * tell a reader, and it is the only chip variant that takes a colour.
 */
const MatchupResearchSection = ({ seasonId, seasonYear = null, week, games = [] }) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const hasGames = games.length > 0;

  const { data: statsByTeam = {}, isLoading } = useCurrentLineups(seasonId, week, {
    enabled: hasGames
  });

  // The NFL calendar, for the "vs BUF" / "@ KC" / "BYE" chips. Deliberately
  // not awaited: a starter renders without their opponent rather than the
  // list waiting on a second query. The chip is context, the lineup is the
  // answer.
  const { data: opponents = {} } = useNflOpponentMap(seasonYear, week, {
    enabled: hasGames
  });

  if (!hasGames) return null;

  const viewer = { user, isAdmin, teamOwnerNames };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-3 px-1">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Research matchups</h3>
            <p className="text-xs text-muted-foreground">
              Rosters and projections for week {week}. Open a matchup to see each side&apos;s
              starters and bench.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            // The collapsed cards are one line each and the panel is already
            // open, so there is no shape to skeleton — only a short wait.
            <RouteLoading className="min-h-[8rem]" />
          ) : (
            games.map((game) => (
              <MatchupCard
                key={game.id}
                game={game}
                statsByTeam={statsByTeam}
                opponents={opponents}
                viewer={viewer}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/** The order the lineup is set in, so two columns read as the same lineup. */
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'];

const positionOf = (row) => row.position ?? row.player?.position ?? null;

/** Unknown slots and positions sort last rather than first. */
const orderOf = (value) => {
  const index = SLOT_ORDER.indexOf(value);
  return index === -1 ? SLOT_ORDER.length : index;
};

const sortBy = (keyOf) => (a, b) =>
  orderOf(keyOf(a)) - orderOf(keyOf(b)) || (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0);

const EMPTY_ROSTER = { starters: [], bench: [], injured: [] };

/**
 * One team's whole roster. Starters sort by the slot they fill; the bench and
 * IR fill no slot, so they sort by position. Anything that is not a scoring
 * starter and not on IR is bench, so no row can fall between the groups.
 */
const rosterFor = (statsByTeam, teamId) => {
  const rows = statsByTeam[teamId] ?? [];
  return {
    starters: rows.filter(isScoringStarter).sort(sortBy((row) => row.rosterSlot)),
    bench: rows
      .filter((row) => !isScoringStarter(row) && row.rosterSlot !== 'IR')
      .sort(sortBy(positionOf)),
    injured: rows.filter((row) => row.rosterSlot === 'IR').sort(sortBy(positionOf))
  };
};

const rosterSize = (roster) =>
  roster.starters.length + roster.bench.length + roster.injured.length;

const MatchupCard = ({ game, statsByTeam, opponents, viewer }) => {
  const [open, setOpen] = useState(false);

  const isBye = game.type === 'bye' || !game.team2;
  const team1Roster = rosterFor(statsByTeam, game.team1?.id);
  const team2Roster = isBye ? EMPTY_ROSTER : rosterFor(statsByTeam, game.team2?.id);
  const hasRows = rosterSize(team1Roster) > 0 || rosterSize(team2Roster) > 0;
  const nameOf = (team) =>
    getMaskedTeamName(team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames);

  // The viewer's own matchup gets the same tint and brand rail as their row
  // in the rankings, and their side the same "You" label as `TeamIdentity`.
  const team1IsViewer = isUserTeam(game.team1, viewer.user);
  const team2IsViewer = !isBye && isUserTeam(game.team2, viewer.user);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border',
        getUserTeamHighlightClasses(team1IsViewer || team2IsViewer)
      )}
    >
      {/* One full-width control, tall enough to hit on a phone. Two side-by-side
          team buttons would put a 44px target inside a 160px column. */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <TeamSide
          team={game.team1}
          total={starterTotal(team1Roster.starters)}
          hasRows={team1Roster.starters.length > 0}
          isViewer={team1IsViewer}
          viewer={viewer}
        />

        <span className="shrink-0 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {isBye ? 'bye' : 'vs'}
        </span>

        {isBye ? (
          <span className="flex-1">
            <Badge variant="warning" className="text-[10px]">
              On bye
            </Badge>
          </span>
        ) : (
          <TeamSide
            team={game.team2}
            total={starterTotal(team2Roster.starters)}
            hasRows={team2Roster.starters.length > 0}
            align="right"
            isViewer={team2IsViewer}
            viewer={viewer}
          />
        )}

        {/* A word beside the chevron. A bare chevron at the end of a row of
            names and numbers reads as decoration; "Lineups" says there is
            something under it, and the pill gives the eye a control to find. */}
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors',
            open && 'bg-muted text-foreground'
          )}
        >
          {open ? 'Hide' : 'Lineups'}
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3">
          {!hasRows ? (
            <p className="text-sm text-muted-foreground">
              No roster has been synced for this team yet.
            </p>
          ) : (
            <div className={cn('grid gap-4', !isBye && 'grid-cols-1 sm:grid-cols-2')}>
              <TeamRoster roster={team1Roster} teamName={nameOf(game.team1)} opponents={opponents} />
              {!isBye && (
                <TeamRoster roster={team2Roster} teamName={nameOf(game.team2)} opponents={opponents} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * `total` is a `{ total, isProjected }` pair from `starterTotal`.
 *
 * This number used to be printed bare, on the reasoning that the per-row "proj"
 * markers below carried the information. They do not: the header is collapsed
 * by default, so for most readers the total is the *only* number they see, and
 * an unlabelled 118.4 beside a team name reads as a score. It is labelled until
 * every starter in it is a result.
 */
const TeamSide = ({ team, total, hasRows, align = 'left', isViewer = false, viewer }) => (
  <span className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
    {/* The label sits outside the truncated name, so a long name on a phone
        loses its tail rather than the "You". */}
    <span className={cn('flex min-w-0 items-baseline gap-1.5', align === 'right' && 'justify-end')}>
      <span className="truncate text-sm font-semibold">
        {getMaskedTeamName(team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames)}
      </span>
      {isViewer && (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-primary/80">
          You
        </span>
      )}
    </span>
    <span className="block truncate text-xs text-muted-foreground">
      {getMaskedOwnerName(team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames)}
      {hasRows && (
        <>
          {' · '}
          <PlayerPoints {...totalAsPoints(total)} />
        </>
      )}
    </span>
  </span>
);

/**
 * One side's roster. Below `sm` the two columns stack, and a full roster is
 * long enough that the second team's rows would read as more of the first's
 * without a name over them; side by side the header row already names them.
 */
const TeamRoster = ({ roster, teamName, opponents }) => (
  <div className="space-y-3">
    <h4 className="truncate text-sm font-semibold sm:hidden">{teamName}</h4>
    <RosterGroup label="Starters" rows={roster.starters} opponents={opponents} />
    <RosterGroup label="Bench" rows={roster.bench} opponents={opponents} bench />
    <RosterGroup
      label="Injured reserve"
      rows={roster.injured}
      opponents={opponents}
      bench
      tone="text-destructive"
    />
  </div>
);

const RosterGroup = ({ label, rows, opponents, bench = false, tone = 'text-foreground' }) => {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <h5 className={cn('text-sm font-semibold', tone)}>{label}</h5>
      <PlayerList rows={rows} opponents={opponents} bench={bench} />
    </div>
  );
};

/**
 * A starter's chip is the slot they fill (FLEX says more than RB there); a
 * bench player fills none, and a column of "BE" chips would say nothing, so
 * theirs is their position, and the row is dimmed.
 */
const PlayerList = ({ rows, opponents = {}, bench = false }) => (
  <ul className="space-y-1">
    {rows.map((row) => (
      <li key={row.id} className={cn('flex items-center gap-2 text-sm', bench && 'text-muted-foreground')}>
        <span
          className={cn(
            'w-11 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em]',
            getPositionColor(bench ? positionOf(row) : row.rosterSlot)
          )}
        >
          {(bench ? positionOf(row) : row.rosterSlot) ?? '—'}
        </span>
        <span className="min-w-0 flex-1 truncate">{row.player?.name ?? '—'}</span>
        {/* A starter on a bye is the single most useful thing this panel can
            say, so it is the one variant that gets colour. An unknown opponent
            renders nothing at all rather than a placeholder — see
            `OpponentChip`. The wrapper keeps the column's width either way so
            the points stay in a straight line. */}
        <span className="w-14 shrink-0 text-right">
          <OpponentChip entry={opponents[row.proTeamId]} warnOnBye />
        </span>
        <PlayerPoints
          actualPoints={row.actualPoints}
          projectedPoints={row.projectedPoints}
          className="w-[4.25rem] shrink-0 text-right"
        />
      </li>
    ))}
  </ul>
);

export default MatchupResearchSection;
