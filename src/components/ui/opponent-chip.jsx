import { cn } from '../../lib/utils';
import { formatOpponent } from '../../../utils/nflOpponent.js';

/**
 * A player's NFL opponent this week: "vs BUF", "@ KC", "BYE".
 *
 * Renders nothing when the calendar has no entry — a free-text pick with no
 * matched player, a player with no NFL team, or a season nobody has imported.
 * That silence is deliberate and load-bearing: the alternative is a placeholder
 * that reads as a fact, and on a bye chip specifically it would tell somebody
 * their starter has the week off when he is playing. `nfl_schedule` carries an
 * explicit row per bye precisely so "off this week" and "we know nothing about
 * this team" stay distinguishable; never substitute one for the other here.
 *
 * A caller that needs its column to keep its width regardless — a lineup list
 * where the points must stay in a straight line — wraps this in a fixed-width
 * span rather than asking for a placeholder.
 *
 * `warnOnBye` colours the bye where the pick is already committed and there is
 * something to do about it. In an autocomplete the same information is a
 * filter, not an alarm, so it stays muted.
 *
 * @param {{ entry?: object|null, warnOnBye?: boolean, className?: string }} props
 *   `entry` comes from `buildOpponentMap` in `hooks/queries/useNflSchedule.js`.
 */
const OpponentChip = ({ entry, warnOnBye = false, className }) => {
  const label = formatOpponent(entry);
  if (!label) return null;

  return (
    <span
      className={cn(
        'shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em]',
        entry.bye && warnOnBye ? 'text-warning' : 'text-muted-foreground',
        className
      )}
    >
      {label}
    </span>
  );
};

export { OpponentChip };
export default OpponentChip;
