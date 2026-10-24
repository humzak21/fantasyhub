import { useState } from 'react';

import { cn } from '../../lib/utils';
import { canonicalTeam, teamLogoUrl } from '../../../utils/playerImages.js';

/**
 * An NFL team's logo, small, beside a player's name (JITS-47).
 *
 * Its box is reserved whatever happens — `width`/`height` on the image and the
 * same size on the empty span that replaces it — so a row never shifts when
 * the logo arrives, and a team this map does not know, or a logo the CDN
 * refuses, leaves a blank square rather than a broken-image icon. It adds to
 * the abbreviation and the `nflTeamColors` tint, never replaces them, so it is
 * decorative to a screen reader unless `label` says otherwise.
 *
 * @param {{ team?: string|null, size?: number, label?: boolean, className?: string }} props
 *   `team` is an abbreviation in any spelling `canonicalTeam` reads.
 */
const NflTeamLogo = ({ team, size = 16, label = false, className }) => {
  const abbreviation = canonicalTeam(team);
  const src = teamLogoUrl(abbreviation);
  const [failedSrc, setFailedSrc] = useState(null);
  const box = { width: size, height: size };

  if (!src || failedSrc === src) {
    return <span aria-hidden="true" className={cn('inline-block shrink-0', className)} style={box} />;
  }
  return (
    <img
      src={src}
      alt={label ? abbreviation : ''}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={cn('inline-block shrink-0 object-contain', className)}
      style={box}
    />
  );
};

export { NflTeamLogo };
export default NflTeamLogo;
