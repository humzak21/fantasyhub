import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { NumberText } from '../ui/number-text';
import RouteLoading from '../layout/RouteLoading';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useCurrentLineups } from '../../../hooks/queries/index.js';
import { getMaskedTeamName, getMaskedOwnerName } from '../../utils/displayNameUtils';
import { getPositionColor } from '../../utils/positionColors';

/**
 * Who is actually starting this week, so a parlay pick is a decision rather
 * than a guess.
 *
 * Deliberately collapsed, twice over. The whole block is behind a toggle
 * because most visits to this page are here to click two buttons and leave;
 * and each matchup is behind its own, because fourteen teams' starting
 * lineups is ~130 rows and nobody reads all of them.
 *
 * The player query does not run until the section is opened for the first
 * time. `hasExpanded` latches rather than tracking `expanded`, so collapsing
 * does not throw the rows away and re-fetch them on the next open.
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
 * `services/db/rosters.js::getCurrentLineupsForWeek`.
 */
const MatchupResearchSection = ({ seasonId, week, games = [] }) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const [expanded, setExpanded] = useState(false);
  const [hasExpanded, setHasExpanded] = useState(false);

  const { data: statsByTeam = {}, isLoading } = useCurrentLineups(seasonId, week, {
    enabled: hasExpanded
  });

  if (games.length === 0) return null;

  const open = () => {
    setExpanded((was) => !was);
    setHasExpanded(true);
  };

  const viewer = { user, isAdmin, teamOwnerNames };

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={open}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Research matchups</span>
            <span className="block text-xs text-muted-foreground">
              Starting lineups and projections for week {week}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>

        {expanded && (
          <div className="space-y-2 border-t border-border p-3 sm:p-4">
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
                  viewer={viewer}
                />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** Bench and IR do not score, so they are not research. */
const isStarter = (row) => row.started && row.rosterSlot !== 'BE' && row.rosterSlot !== 'IR';

/** The order the lineup is set in, so two columns read as the same lineup. */
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'];

const startersFor = (statsByTeam, teamId) =>
  (statsByTeam[teamId] ?? [])
    .filter(isStarter)
    .sort((a, b) => {
      const bySlot = SLOT_ORDER.indexOf(a.rosterSlot) - SLOT_ORDER.indexOf(b.rosterSlot);
      if (bySlot !== 0) return bySlot;
      return (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0);
    });

/** A starter's points: the actual once it exists, the projection until then. */
const pointsFor = (row) => (row.actualPoints != null ? row.actualPoints : row.projectedPoints);

const totalFor = (rows) => rows.reduce((sum, row) => sum + Number(pointsFor(row) ?? 0), 0);

const MatchupCard = ({ game, statsByTeam, viewer }) => {
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
          total={totalFor(team1Starters)}
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
            total={totalFor(team2Starters)}
            hasRows={team2Starters.length > 0}
            align="right"
            viewer={viewer}
          />
        )}

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-border p-3">
          {!hasRows ? (
            <p className="text-sm text-muted-foreground">
              No roster has been synced for this team yet.
            </p>
          ) : (
            <div className={cn('grid gap-4', !isBye && 'grid-cols-1 sm:grid-cols-2')}>
              <StarterList rows={team1Starters} />
              {!isBye && <StarterList rows={team2Starters} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
          <NumberText value={total} />
        </>
      )}
    </span>
  </span>
);

const StarterList = ({ rows }) => (
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
        {/* Reserved: "vs BUF" / "@ KC" / "BYE" chip, pending an nfl_schedule
            table keyed on `pro_team_id`. */}
        <NumberText
          value={pointsFor(row)}
          className={cn('w-12 shrink-0 text-right', row.actualPoints == null && 'text-muted-foreground')}
        />
      </li>
    ))}
  </ul>
);

export default MatchupResearchSection;
