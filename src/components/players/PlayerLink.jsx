import { cn } from '../../lib/utils';
import { usePlayerDetail } from './PlayerDetailContext.jsx';

/**
 * A player's name, as the way into his page — the player's `TeamLink`.
 *
 * A `<button>` when the shell can open players and an id is known (the
 * league's `playerId` or ESPN's `espnPlayerId`); otherwise the plain text in a
 * span. Clicks stop here, so a clickable row behind the name does not fire too.
 *
 * **Never inside another `<button>`** (a pick'em side, a bracket slot): an
 * interactive element cannot nest there, and the press already means
 * something. Those surfaces keep the plain name.
 */
export function PlayerLink({ playerId, espnPlayerId, className, children, onClick, ...props }) {
  const { available, open } = usePlayerDetail();
  const hasId = Boolean(playerId) || (espnPlayerId != null && espnPlayerId !== '');

  if (!available || !hasId) return <span className={className}>{children}</span>;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        open(playerId ? { playerId } : { espnPlayerId });
      }}
      className={cn(
        'min-w-0 rounded-sm text-left hover:underline focus-visible:underline focus-visible:outline-none',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default PlayerLink;
