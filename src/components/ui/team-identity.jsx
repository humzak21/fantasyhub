import * as React from 'react';
import { cn } from '../../lib/utils';
import { getTeamColor, getTeamInitials } from '../../utils/teamColors';
import { RecordText } from './number-text';

/**
 * A team, shown the same way everywhere.
 *
 * Team identity used to be a string of text — masked team name over masked
 * owner name — and nothing else. No colour, no mark, nothing to recognise at a
 * glance, which is why a fourteen-row table reads as fourteen identical rows
 * and why the same franchise was a different colour on every chart.
 *
 * The colour comes from `getTeamColor()`, keyed on the franchise, so the chip
 * here matches the series in the chart below it and the slot in the bracket.
 * The initials come from the *owner*, which is the identity that survives a
 * team rename.
 */
const SIZES = {
  xs: { avatar: 'h-6 w-6 text-[10px]', name: 'text-xs', sub: 'text-[10px]', gap: 'gap-1.5' },
  sm: { avatar: 'h-8 w-8 text-xs', name: 'text-sm', sub: 'text-xs', gap: 'gap-2' },
  md: { avatar: 'h-10 w-10 text-sm', name: 'text-base', sub: 'text-xs', gap: 'gap-3' },
  lg: { avatar: 'h-12 w-12 text-base', name: 'text-lg', sub: 'text-sm', gap: 'gap-3' },
};

/**
 * The mark on its own — for a chart legend, a bracket slot, anywhere the name
 * is already present.
 */
const TeamAvatar = React.forwardRef(({ team, size = 'sm', className, ...props }, ref) => {
  const color = getTeamColor(team);
  const s = SIZES[size] ?? SIZES.sm;
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        // The tint is the team colour at low alpha with a full-strength ring
        // and text, which stays legible on the dark field where a solid fill
        // of the same hue would not.
        'bg-current/15 ring-1 ring-current/40',
        color.text,
        s.avatar,
        className
      )}
      {...props}
    >
      {getTeamInitials(team)}
    </span>
  );
});
TeamAvatar.displayName = 'TeamAvatar';

/**
 * @param {object} props
 * @param {object} props.team - anything with a franchise id, owner or name
 * @param {'xs'|'sm'|'md'|'lg'} [props.size]
 * @param {boolean} [props.showOwner] - second line with the owner's name
 * @param {boolean} [props.showRecord] - append the record to the second line
 * @param {boolean} [props.showAvatar]
 * @param {boolean} [props.isViewer] - the signed-in user's own team
 */
const TeamIdentity = React.forwardRef(
  (
    {
      team,
      size = 'sm',
      showOwner = false,
      showRecord = false,
      showAvatar = true,
      isViewer = false,
      className,
      ...props
    },
    ref
  ) => {
    if (!team) return null;
    const s = SIZES[size] ?? SIZES.sm;
    const name = team.name ?? team.teamName ?? team.team_name ?? 'Unknown team';
    const owner = team.ownerName ?? team.owner_name ?? team.owner;
    const hasSecondLine = (showOwner && owner) || showRecord;

    return (
      <div ref={ref} className={cn('flex min-w-0 items-center', s.gap, className)} {...props}>
        {showAvatar && <TeamAvatar team={team} size={size} />}
        <div className="min-w-0">
          <div className={cn('truncate font-semibold leading-tight', s.name)}>
            {name}
            {isViewer && (
              <span className="ml-1.5 rounded bg-primary/15 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-primary align-middle">
                You
              </span>
            )}
          </div>
          {hasSecondLine && (
            <div className={cn('flex items-center gap-1.5 truncate text-muted-foreground', s.sub)}>
              {showOwner && owner && <span className="truncate">{owner}</span>}
              {showOwner && owner && showRecord && <span aria-hidden="true">·</span>}
              {showRecord && (
                <RecordText
                  wins={team.wins}
                  losses={team.losses}
                  ties={team.ties}
                  className="shrink-0"
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);
TeamIdentity.displayName = 'TeamIdentity';

export { TeamIdentity, TeamAvatar };
