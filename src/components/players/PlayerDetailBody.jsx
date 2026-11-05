import { PlayerAvatar } from '../ui/player-avatar.jsx';
import { getPositionColor } from '../../utils/positionColors.js';
import { cn } from '../../lib/utils';

/**
 * The player page's contents, inside the shell `PlayerDetail` draws.
 *
 * **A placeholder.** The sections agent replaces this body with the sections
 * of Contract 5 (header, headline tiles, season bar, game log, …). The props
 * are the contract and stay:
 *
 * @param {object} props
 * @param {object} props.profile - `buildPlayerProfile`'s output, never null here
 * @param {object|null} props.ranking - `rankCareers`' output, or null while it loads or failed
 * @param {object} props.rankingQuery - the careers query, for its loading and error states
 * @param {object} props.viewer - `useViewer()`, for masking franchises
 * @param {() => void} props.onClose - closes the page (pass to a `TeamLink`'s `onClick`)
 */
export default function PlayerDetailBody({ profile }) {
  const { player } = profile;
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <PlayerAvatar
          name={player.name}
          espnPlayerId={player.espnPlayerId}
          position={player.position}
          team={player.proTeam ?? player.teamAbbreviation}
          showTeam
          size={64}
        />
        <div className="min-w-0">
          <p className="truncate font-display text-3xl leading-tight tracking-[-0.01em] text-foreground">
            {player.name}
          </p>
          {player.position && (
            <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold', getPositionColor(player.position))}>
              {player.position}
            </span>
          )}
        </div>
      </div>
      <div data-slot="sections" />
    </div>
  );
}
