import { OpponentChip } from '../ui/opponent-chip';
import { PlayerPoints } from '../ui/player-points';
import { getPositionColor } from '../../utils/positionColors';
import { cn } from '../../lib/utils';
import { useLineupsForWeek, useNflOpponentMap } from '../../../hooks/queries/index.js';

/** The slots this league starts, in lineup order. Matches OPTIMAL_LINEUP_TEMPLATE. */
const STARTER_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'];

/**
 * The lineups behind one matchup.
 *
 * Mounted only while the disclosure is open, which is what makes its queries
 * lazy — there is no `enabled` latch to maintain, and TanStack's cache means
 * closing and reopening does not refetch.
 *
 * **Which table it reads is decided by the week, not by convenience.** A week
 * that is over is a past-tense question — who actually started, and what they
 * actually scored — and that is `player_week_stats`, the historical fact table
 * the cron writes once. A week that has not finished is a present-tense
 * question, and `player_week_stats` cannot answer one: between two syncs it
 * describes a roster that has since taken waivers and changed its lineup, which
 * on 2026-08-31 made it name 122 of 125 starters wrongly. That week reads the
 * live `rosters` snapshot instead, through `getCurrentLineupsForWeek`.
 *
 * The past/present choice is `useLineupsForWeek`'s, not this component's —
 * the card's projected score line reads the same hook, and a score that came
 * from one table while the lineup under it came from the other would not add
 * up.
 *
 * The card this replaces read the `rosters` prop — the whole league's roster
 * snapshot, with no points and no opponent, and with an `injuryStatus` the
 * query never selected, so the injury dot below could not fire. `rosters` now
 * survives only as the disclosure's "is there anything to open" gate.
 */
const LineupPanel = ({ seasonId, nflSeasonYear, week, actualWeek, sides = [] }) => {
  const { data: rowsByTeam, isLoading } = useLineupsForWeek(seasonId, week, { actualWeek });

  // The NFL calendar, for the "vs BUF" / "@ KC" / "BYE" chips. One cache entry
  // per season, shared with every other chip on the page, and deliberately not
  // awaited: a lineup renders without its opponents rather than waiting on a
  // second query.
  const { data: opponents = {} } = useNflOpponentMap(nflSeasonYear, week);

  if (isLoading) return <LineupSkeleton />;

  const hasAnything = sides.some((side) => (rowsByTeam?.[side.teamId]?.length || 0) > 0);

  if (!hasAnything) {
    return (
      <div className="border-t border-border/60 p-3.5 text-xs text-muted-foreground">
        {/* Honest for a pre-2026 week: `player_week_stats` starts with the 2026
            season, so there is genuinely no lineup to show rather than a
            failure to load one. */}
        No lineup data for this week.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 border-t border-border/60 p-3.5 sm:grid-cols-2">
      {sides.map((side) => (
        <TeamLineup
          key={side.teamId}
          teamName={side.teamName}
          rows={rowsByTeam?.[side.teamId] ?? []}
          opponents={opponents}
        />
      ))}
    </div>
  );
};

/**
 * A skeleton rather than a spinner, because the shape *is* predictable here —
 * a lineup is a column of slot/name/points rows, and reserving it means the
 * card does not resize under the reader when the rows land.
 */
const LineupSkeleton = () => (
  <div
    role="status"
    aria-label="Loading lineups"
    className="grid grid-cols-1 gap-5 border-t border-border/60 p-3.5 sm:grid-cols-2"
  >
    {[0, 1].map((column) => (
      <div key={column} className="space-y-2" aria-hidden="true">
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
        {Array.from({ length: 7 }, (_, row) => (
          <div key={row} className="flex items-center gap-2">
            <div className="h-4 w-10 shrink-0 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    ))}
    <span className="sr-only">Loading lineups</span>
  </div>
);

/**
 * One team's lineup, grouped by slot. Starters in lineup order, then bench,
 * then IR — the order the manager set it in, so the two columns read as the
 * same lineup side by side.
 */
const TeamLineup = ({ teamName, rows, opponents }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="space-y-3">
        {teamName && <h4 className="truncate text-sm font-semibold">{teamName}</h4>}
        <div className="text-xs text-muted-foreground">No lineup for this team.</div>
      </div>
    );
  }

  const grouped = rows.reduce((acc, row) => {
    const slot = row.rosterSlot || 'BE';
    (acc[slot] ||= []).push(row);
    return acc;
  }, {});

  const starters = STARTER_SLOTS.flatMap((slot) => grouped[slot] || []);
  const bench = grouped.BE || [];
  const injured = grouped.IR || [];

  const group = (label, players, tone) =>
    players.length > 0 && (
      <div className="space-y-1">
        <h5 className={cn('text-sm font-semibold', tone)}>{label}</h5>
        {players.map((row, idx) => (
          <PlayerRow
            key={row.id ?? `${label}-${idx}`}
            row={row}
            opponent={opponents[row.proTeamId]}
            muted={label !== 'Starters'}
          />
        ))}
      </div>
    );

  return (
    <div className="space-y-3">
      {teamName && <h4 className="truncate text-sm font-semibold">{teamName}</h4>}
      {group('Starters', starters, 'text-foreground')}
      {group('Bench', bench, 'text-foreground')}
      {group('Injured reserve', injured, 'text-destructive')}
    </div>
  );
};

const PlayerRow = ({ row, opponent, muted }) => {
  const playerName = row.player?.name || row.playerName || 'Unknown';
  const position = row.position || row.player?.position || '?';
  const isInjured = row.injuryStatus && row.injuryStatus !== 'ACTIVE';

  return (
    <div className={cn('flex items-center gap-2 text-xs', muted && 'text-muted-foreground')}>
      <span
        className={cn(
          'w-10 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold',
          getPositionColor(position)
        )}
      >
        {position}
      </span>
      <span className="min-w-0 flex-1 truncate">{playerName}</span>
      {isInjured && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
          title={row.injuryStatus}
          aria-label={row.injuryStatus}
        />
      )}
      {/* Fixed width whether or not the chip renders — an unknown opponent is
          nothing at all, and the points must still line up down the column. */}
      <span className="w-12 shrink-0 text-right">
        <OpponentChip entry={opponent} warnOnBye />
      </span>
      <PlayerPoints
        actualPoints={row.actualPoints}
        projectedPoints={row.projectedPoints}
        className="w-[4.25rem] shrink-0 text-right"
      />
    </div>
  );
};

export { LineupPanel, LineupSkeleton, TeamLineup, PlayerRow };
export default LineupPanel;
