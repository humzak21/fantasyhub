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
 * view. The per-matchup fold stays, because fourteen teams' starting lineups
 * is ~130 rows and nobody reads all of them; each row now says "Lineups" next
 * to its chevron so it reads as a disclosure rather than a label.
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
              Starting lineups and projections for week {week}. Open a matchup to see who
              each side is starting.
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

const startersFor = (statsByTeam, teamId) =>
  (statsByTeam[teamId] ?? [])
    .filter(isScoringStarter)
    .sort((a, b) => {
      const bySlot = SLOT_ORDER.indexOf(a.rosterSlot) - SLOT_ORDER.indexOf(b.rosterSlot);
      if (bySlot !== 0) return bySlot;
      return (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0);
    });

const MatchupCard = ({ game, statsByTeam, opponents, viewer }) => {
  const [open, setOpen] = useState(false);

  const isBye = game.type === 'bye' || !game.team2;
  const team1Starters = startersFor(statsByTeam, game.team1?.id);
  const team2Starters = isBye ? [] : startersFor(statsByTeam, game.team2?.id);
  const hasRows = team1Starters.length > 0 || team2Starters.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
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
          total={starterTotal(team1Starters)}
          hasRows={team1Starters.length > 0}
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
            total={starterTotal(team2Starters)}
            hasRows={team2Starters.length > 0}
            align="right"
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
              <StarterList rows={team1Starters} opponents={opponents} />
              {!isBye && <StarterList rows={team2Starters} opponents={opponents} />}
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
const TeamSide = ({ team, total, hasRows, align = 'left', viewer }) => (
  <span className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
    <span className="block truncate text-sm font-semibold">
      {getMaskedTeamName(team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames)}
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

const StarterList = ({ rows, opponents = {} }) => (
  <ul className="space-y-1">
    {rows.map((row) => (
      <li key={row.id} className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            'w-11 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em]',
            getPositionColor(row.rosterSlot)
          )}
        >
          {row.rosterSlot}
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
