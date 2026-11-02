import { cn } from '../../lib/utils';
import { formatPoints } from '../../utils/format';
import { LiveDot } from './live-dot';
import { NumberText } from './number-text';

/**
 * What a player scored this week, or is expected to.
 *
 * The two numbers are not the same claim and must not read as one. An actual
 * is what happened; a projection is a guess ESPN published before kickoff, and
 * a lineup rendered mid-season shows both at once — the Thursday game is
 * settled while Sunday's is not. Colouring the projection more faintly, which
 * is what this replaces, said "less important" rather than "not a result", and
 * a reader scanning a column of figures cannot recover the difference from a
 * shade.
 *
 * So the projection is *labelled*. `proj 14.2` and `14.2` are two different
 * statements, and the transition from one to the other as the games complete
 * is the whole story this column tells.
 *
 * Missing is an em dash, never `0` — a player with no projection has not been
 * projected to score nothing (`utils/format.js`). The dash carries no label:
 * "proj —" would assert a projection that does not exist.
 *
 * `display` sets the figure in the scoreboard face, for the one place this
 * stands in for a matchup score rather than a player's line. The "proj" label
 * stays small either way — it is an annotation on the number, not part of it.
 *
 * **Live is a third claim**, neither a result nor a guess: the figure is real
 * and it is still moving. `live="playing"` means on the field now, with the
 * pulsing dot and "live" where "proj" sits. `live="between"` is a team's score
 * with more to come and nobody on the field, which reads "so far": a dot that
 * pulses through a Saturday would be claiming a game nobody is playing.
 *
 * @param {{
 *   actualPoints?: number|null,
 *   projectedPoints?: number|null,
 *   live?: 'playing'|'between'|null,
 *   display?: boolean,
 *   className?: string
 * }} props
 */
const PlayerPoints = ({
  actualPoints = null,
  projectedPoints = null,
  live = null,
  display = false,
  className
}) => {
  if (actualPoints != null && live) {
    return (
      <span className={cn('inline-flex items-baseline justify-end gap-1', className)}>
        {live === 'playing' && <LiveDot className="self-center text-success" />}
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {live === 'playing' ? 'live' : 'so far'}
        </span>
        <NumberText value={actualPoints} display={display} />
      </span>
    );
  }

  if (actualPoints != null) {
    return <NumberText value={actualPoints} display={display} className={className} />;
  }

  if (projectedPoints != null) {
    return (
      <span className={cn('inline-flex items-baseline justify-end gap-1', className)}>
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          proj
        </span>
        <NumberText
          value={projectedPoints}
          display={display}
          className="text-muted-foreground"
        />
      </span>
    );
  }

  return <NumberText value={null} display={display} className={className} />;
};

/**
 * What a side has left, under its live score: "2 yet to play · proj 132.8".
 * Renders nothing before a lineup is under way, or once it has finished.
 *
 * @param {{ total?: object|null, projected?: number|null, className?: string }} props
 */
const LiveSideNote = ({ total, projected = null, className }) => {
  if (total?.liveState !== 'playing' && total?.liveState !== 'between') return null;

  const parts = [];
  if (total.yetToPlay > 0) parts.push(`${total.yetToPlay} yet to play`);
  if (projected != null) parts.push(`proj ${formatPoints(projected)}`);
  if (parts.length === 0) return null;

  return <p className={cn('text-xs text-muted-foreground tabular', className)}>{parts.join(' · ')}</p>;
};

export { LiveSideNote, PlayerPoints };
export default PlayerPoints;
