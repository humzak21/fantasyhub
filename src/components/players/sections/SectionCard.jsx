import { SectionHeading } from '../../ui/section-heading.jsx';
import { TeamLink } from '../../ui/team-link.jsx';
import { cn } from '../../../lib/utils';
import { EMPTY } from '../../../utils/format';
import { SURFACE, maskFranchise } from './sectionFormat.js';

/**
 * One section of the player page: a lit card with an h3 heading.
 */
export function SectionCard({ title, icon, aside, className, children, ...props }) {
  return (
    <section className={cn('@container min-w-0 space-y-3 rounded-xl border border-border bg-card p-4', SURFACE, className)} {...props}>
      <SectionHeading as="h3" icon={icon} aside={aside}>{title}</SectionHeading>
      {children}
    </section>
  );
}

/** A section's quiet "nothing here" line. Never a blank card. */
export function SectionEmpty({ children }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * A franchise's name as this viewer may see it, linked to its profile. The
 * click also closes the player page, or it would stay open over the profile.
 */
export function FranchiseLink({ franchise, viewer, onClose, className }) {
  if (!franchise) return <span className={cn('text-muted-foreground', className)}>{EMPTY}</span>;
  return (
    <TeamLink franchiseId={franchise.id} onClick={onClose} className={cn('truncate', className)}>
      {maskFranchise(franchise, viewer)}
    </TeamLink>
  );
}
