import { Link } from 'react-router-dom';

import { useCanOpenProfiles } from '../../contexts/FranchiseAvatarsContext.jsx';
import { cn } from '../../lib/utils';
import { TeamIdentity } from './team-identity';
import { franchiseIdOf } from '../../../utils/viewerTeam.js';
import { profilePath } from '../profile/profileLink.js';

/**
 * A team's name, as a link to its profile.
 *
 * Profiles are for approved members, so anyone else sees what the page showed
 * before: a link to wherever `fallbackTo` says, or the plain name. A link whose
 * only outcome is a redirect is the bug the route guard's comments keep naming.
 *
 * Not for a name inside a `<button>` (a pick'em or bracket slot): an anchor
 * cannot nest there, and the press already means something. Clicks stop here so
 * a clickable row behind the name does not fire too.
 *
 * @param {object} props
 * @param {object} [props.team] - anything with a franchise id
 * @param {string} [props.franchiseId] - or the id itself
 * @param {string} [props.fallbackTo] - where the name goes for everyone else
 */
export function TeamLink({ team, franchiseId, fallbackTo, className, children, onClick, ...props }) {
  const canOpenProfiles = useCanOpenProfiles();
  const id = franchiseId ?? franchiseIdOf(team);
  const to = canOpenProfiles && id ? profilePath(id) : fallbackTo;

  if (!to) return className ? <span className={className}>{children}</span> : children;

  return (
    <Link
      to={to}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      className={cn('min-w-0 hover:underline focus-visible:underline', className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * `TeamIdentity` as a link: the chip, the name and the owner are one target, and
 * the name underlines on hover. `team` carries the masked name already, as it
 * does for `TeamIdentity`.
 */
export function TeamIdentityLink({ team, fallbackTo, linkClassName, ...identity }) {
  return (
    <TeamLink
      team={team}
      fallbackTo={fallbackTo}
      className={cn(
        'group -m-1 inline-flex min-w-0 max-w-full rounded-md p-1 outline-none hover:no-underline focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-ring',
        linkClassName
      )}
    >
      <TeamIdentity
        team={team}
        nameClassName="underline-offset-2 decoration-foreground/40 group-hover:underline"
        {...identity}
      />
    </TeamLink>
  );
}

export default TeamLink;
