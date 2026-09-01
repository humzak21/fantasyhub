import { cn } from '../../lib/utils';
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
 * @param {{
 *   actualPoints?: number|null,
 *   projectedPoints?: number|null,
 *   className?: string
 * }} props
 */
const PlayerPoints = ({ actualPoints = null, projectedPoints = null, className }) => {
  if (actualPoints != null) {
    return <NumberText value={actualPoints} className={className} />;
  }

  if (projectedPoints != null) {
    return (
      <span className={cn('inline-flex items-baseline justify-end gap-1', className)}>
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          proj
        </span>
        <NumberText value={projectedPoints} className="text-muted-foreground" />
      </span>
    );
  }

  return <NumberText value={null} className={className} />;
};

export { PlayerPoints };
export default PlayerPoints;
