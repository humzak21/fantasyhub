import { useState } from 'react';

import { cn } from '../../lib/utils';
import { defenseTeam, headshotUrl, initialsOf, isTeamDefense, teamLogoUrl } from '../../../utils/playerImages.js';
import { NflTeamLogo } from './nfl-team-logo';

/**
 * A player's face in a circle, beside his name (JITS-47).
 *
 * - **A defence shows its team's logo**: a D/ST has no headshot. With no
 *   `team` given, the team comes from the defence's own ESPN id.
 * - **A missing headshot is never a broken image.** No ESPN id (a free-text
 *   parlay pick), or a CDN 404, falls back to the player's initials on the
 *   neutral muted circle, as the league's own avatars do.
 * - **Nothing moves when it loads.** The circle is a fixed box, the image is
 *   lazy and fills it, and until it arrives the circle is plain muted rather
 *   than initials: ESPN's headshots are transparent, so initials left
 *   underneath would show through the face.
 * - `team` adds the team's logo as a small badge on the circle's corner, for a
 *   row that has room for one image and not two.
 *
 * Decorative to a screen reader: the name is always beside it.
 *
 * @param {{ name?: string, espnPlayerId?: number|null, position?: string|null,
 *   team?: string|null, showTeam?: boolean, size?: number, className?: string }} props
 */
const PlayerAvatar = ({ name, espnPlayerId, position, team, showTeam = false, size = 24, className }) => {
  const defense = isTeamDefense({ position, espnPlayerId });
  const src = defense ? teamLogoUrl(team ?? defenseTeam(espnPlayerId)) : headshotUrl(espnPlayerId);
  const [state, setState] = useState({ src: null, status: 'loading' });
  const status = state.src === src ? state.status : 'loading';
  const failed = !src || status === 'failed';
  const badge = showTeam && !defense && team ? Math.max(10, Math.round(size * 0.5)) : 0;

  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border',
          defense && 'bg-card'
        )}
      >
        {failed ? (
          <span
            className="select-none font-semibold leading-none text-muted-foreground"
            style={{ fontSize: Math.max(8, Math.round(size * 0.38)) }}
          >
            {initialsOf(name)}
          </span>
        ) : (
          <img
            src={src}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setState({ src, status: 'loaded' })}
            onError={() => setState({ src, status: 'failed' })}
            className={cn(
              'h-full w-full',
              defense ? 'object-contain p-[12%]' : 'object-cover object-top',
              status !== 'loaded' && 'opacity-0'
            )}
          />
        )}
      </span>
      {badge > 0 && (
        <span
          className="absolute -bottom-0.5 -right-1 flex items-center justify-center rounded-full bg-background ring-1 ring-border"
          style={{ width: badge + 2, height: badge + 2 }}
        >
          <NflTeamLogo team={team} size={badge} />
        </span>
      )}
    </span>
  );
};

/**
 * The image a dense player row can afford, chosen by the row's own width.
 *
 * The rows it sits in (slot chip, name, opponent, points) leave the name
 * roughly the list's width less 180px, so an image is only worth its room
 * once the list is wide enough that a name survives it. Measured on the live
 * pages (2026-10-25):
 *
 * - **Under 19rem, nothing**: the research panel on a phone (~290px) and the
 *   Schedule card's two desktop columns (274px, 210px at 1024), where names
 *   already truncate.
 * - **19–20rem, the team's logo, 14px**: a 375px phone's Schedule and Teams
 *   lists (~310px).
 * - **20rem and up, the headshot with the team badge**: a 390px phone and
 *   wider, and the desktop Teams cards (342px).
 *
 * Container queries, not viewport breakpoints and not JS: the same lineup is a
 * phone's full width on one page and half a desktop card on another. **Needs
 * an `@container` ancestor**, the list that holds the rows.
 */
const PlayerMark = ({ name, espnPlayerId, position, team }) => (
  <>
    <NflTeamLogo team={team} size={14} className="hidden @[19rem]:inline-block @[20rem]:hidden" />
    <PlayerAvatar
      name={name}
      espnPlayerId={espnPlayerId}
      position={position}
      team={team}
      showTeam
      size={24}
      className="hidden @[20rem]:inline-flex"
    />
  </>
);

export { PlayerAvatar, PlayerMark };
export default PlayerAvatar;
