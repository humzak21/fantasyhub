import { PlayerAvatar } from '../../ui/player-avatar';
import { PlayerLink } from '../../players/PlayerLink';
import { TeamAvatar } from '../../ui/team-identity';
import { TeamLink } from '../../ui/team-link';
import { formatDate } from '../../../lib/utils';

const playerName = (player) => player.name ?? 'Unknown player';

/** "$15 FAAB", or "FAAB" for a trade known to have moved budget by an amount not on record. */
const faabLabel = (faab) => (faab.amount != null ? `${faab.amount} FAAB` : 'FAAB');

function FaabLine({ faab }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-xs">
      <span aria-hidden="true" className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
        $
      </span>
      <span className="text-foreground tabular">{faabLabel(faab)}</span>
    </li>
  );
}

/** "Wk 6 · Oct 14, 2021", or "Wk 6, 2021" for a trade with no processed date. */
function tradeWhen(trade) {
  const week = trade.week != null ? `Wk ${trade.week}` : null;
  if (trade.processedAt) return [week, formatDate(trade.processedAt)].filter(Boolean).join(' · ');
  return [week, trade.year].filter(Boolean).join(', ');
}

function PlayerLine({ player }) {
  // No team badge: the only team on file is where he plays now, not at the trade.
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-xs">
      <PlayerAvatar name={player.name} espnPlayerId={player.espnPlayerId} position={player.position} size={18} />
      <PlayerLink espnPlayerId={player.espnPlayerId} className="min-w-0 break-words text-foreground">
        {playerName(player)}
      </PlayerLink>
      {player.position && (
        <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {player.position}
        </span>
      )}
    </li>
  );
}

/**
 * A list of trades, newest first: when, and who received which players.
 * Franchise names come through `identity`, so they mask exactly as the row or
 * profile around them does. A trade record's row and a franchise's profile both
 * draw this.
 *
 * `count` is the row's figure. For "Most trades" that is `transactions.trades`,
 * a different table from the trades listed; where it runs past them — a season
 * the sync has counted but not yet stored move by move — the difference is
 * stated rather than left to look like a missing trade.
 */
export function TradeList({ id, trades, count = trades.length, identity }) {
  const unlisted = Math.max(0, Math.round(count) - trades.length);

  return (
    <div id={id} className="mt-2 space-y-2">
      {trades.length > 0 && (
        <ol aria-label="Trades" className="space-y-2">
          {trades.map((trade, index) => (
            <li key={trade.id ?? index} className="rounded-md bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                {tradeWhen(trade)}
              </p>

              {trade.directed ? (
                <div className="mt-2 space-y-2.5">
                  {trade.sides.map((side) => {
                    const name = identity.franchiseName(side.franchiseId);
                    return (
                      <div key={side.franchiseId} className="min-w-0">
                        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                          <TeamAvatar team={identity.avatar(side.franchiseId)} size="xs" />
                          <TeamLink franchiseId={side.franchiseId} className="break-words">{name}</TeamLink>
                          <span className="shrink-0 text-[10px] font-normal uppercase tracking-[0.06em] text-muted-foreground">
                            received
                          </span>
                        </p>
                        <ul aria-label={`${name} received`} className="mt-1 space-y-0.5 pl-7">
                          {side.received.map((player, playerIndex) => (
                            <PlayerLine key={player.espnPlayerId ?? playerIndex} player={player} />
                          ))}
                          {side.faabReceived && <FaabLine faab={side.faabReceived} />}
                          {side.received.length === 0 && !side.faabReceived && (
                            <li className="text-xs text-muted-foreground">No players</li>
                          )}
                        </ul>
                        {side.dropped.length > 0 && (
                          <p className="mt-1 pl-7 text-[11px] text-muted-foreground">
                            Dropped {side.dropped.map(playerName).join(', ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Stored before direction was: the players, without guessing a side.
                <div className="mt-2 min-w-0">
                  <p className="break-words text-xs font-medium">
                    {trade.sides.map((side) => identity.franchiseName(side.franchiseId)).join(' & ')}
                  </p>
                  <ul aria-label="Players moved" className="mt-1 space-y-0.5">
                    {trade.players.map((player, playerIndex) => (
                      <PlayerLine key={player.espnPlayerId ?? playerIndex} player={player} />
                    ))}
                    {trade.faab && <FaabLine faab={trade.faab} />}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {unlisted > 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {unlisted} more counted {unlisted === 1 ? 'trade has' : 'trades have'} no detail on record.
        </p>
      )}
    </div>
  );
}
