import { OpponentChip } from '../ui/opponent-chip';
import { PlayerMark } from '../ui/player-avatar';
import { PlayerPoints } from '../ui/player-points';
import { cn } from '../../lib/utils';
import { getPositionColor } from '../../utils/positionColors';
import { rowAsPoints, isScoringStarter } from '../../../utils/lineupTotals.js';
import { teamOf } from '../../../utils/playerImages.js';

/**
 * One team's whole roster for a week, under a matchup's card.
 *
 * Starters in lineup order, then the bench, then IR, the grouping Schedule's
 * lineup panel uses. It used to filter to starters, which hid the depth behind
 * a questionable starter, the thing a reader researching a pick most wants to
 * see. A team's total still counts starters only: bench points are not the
 * team's.
 *
 * The rows are `useLineupsForWeek`'s, so a week in progress reads the live
 * roster with the snapshot's points laid over it, and a figure that is still a
 * projection is labelled "proj" rather than merely dimmed. A starter with no
 * figure at all still appears, with a dash.
 *
 * Each player also carries their NFL opponent, joined from `nfl_schedule` on
 * `proTeamId`. A starter on a bye is the most actionable thing this can tell a
 * reader, and it is the only chip variant that takes a colour.
 */

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

/**
 * One team's whole roster. Starters sort by the slot they fill; the bench and
 * IR fill no slot, so they sort by position. Anything that is not a scoring
 * starter and not on IR is bench, so no row can fall between the groups.
 */
export const rosterFor = (rows = []) => {
  return {
    starters: rows.filter(isScoringStarter).sort(sortBy((row) => row.rosterSlot)),
    bench: rows
      .filter((row) => !isScoringStarter(row) && row.rosterSlot !== 'IR')
      .sort(sortBy(positionOf)),
    injured: rows.filter((row) => row.rosterSlot === 'IR').sort(sortBy(positionOf))
  };
};

export const rosterSize = (roster) =>
  roster.starters.length + roster.bench.length + roster.injured.length;

/**
 * One side's roster. Below `sm` the two columns stack, and a full roster is
 * long enough that the second team's rows would read as more of the first's
 * without a name over them; side by side the header row already names them.
 */
export const TeamRoster = ({ roster, teamName, opponents }) => (
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
  <ul className="@container space-y-1">
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
        <PlayerMark
          name={row.player?.name}
          espnPlayerId={row.espnPlayerId}
          position={positionOf(row)}
          team={teamOf({ proTeamId: row.proTeamId, teamAbbreviation: row.player?.teamAbbreviation })}
        />
        <span className="min-w-0 flex-1 truncate">{row.player?.name ?? '—'}</span>
        {/* A starter on a bye is the single most useful thing this panel can
            say, so it is the one variant that gets colour. An unknown opponent
            renders nothing at all rather than a placeholder — see
            `OpponentChip`. The wrapper keeps the column's width either way so
            the points stay in a straight line. */}
        <span className="w-14 shrink-0 text-right">
          <OpponentChip entry={opponents[row.proTeamId]} warnOnBye />
        </span>
        <PlayerPoints {...rowAsPoints(row)} className="w-[4.25rem] shrink-0 text-right" />
      </li>
    ))}
  </ul>
);
