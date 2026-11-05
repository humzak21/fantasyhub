import { useMemo } from 'react';
import { Users } from 'lucide-react';

import { TeamAvatar } from '../../ui/team-identity.jsx';
import { FranchiseLink, SectionCard, SectionEmpty } from './SectionCard.jsx';
import { maskFranchise, plural, weekSpan } from './sectionFormat.js';

/** The franchise that had him longest in the stints shown, with its weeks. */
function longestHolder(stints) {
  const weeks = new Map();
  for (const stint of stints) {
    if (!stint.franchise) continue;
    const prev = weeks.get(stint.franchiseId);
    weeks.set(stint.franchiseId, { franchise: stint.franchise, weeks: (prev?.weeks ?? 0) + stint.weeks });
  }
  return [...weeks.values()].sort((a, b) => b.weeks - a.weeks)[0] ?? null;
}

/**
 * Every run of consecutive weeks he spent on one franchise, by season. The
 * avatar is drawn from the masked name, since a face or initials would unmask
 * the row.
 */
export default function OwnershipHistory({ profile, season, viewer, onClose }) {
  const stints = useMemo(
    () => (profile.stints ?? []).filter((s) => !season || s.seasonId === season.seasonId),
    [profile.stints, season]
  );
  const byYear = useMemo(() => {
    const groups = [];
    for (const stint of stints) {
      const last = groups[groups.length - 1];
      if (last && last.year === stint.year) last.stints.push(stint);
      else groups.push({ year: stint.year, stints: [stint] });
    }
    return groups;
  }, [stints]);
  const top = longestHolder(stints);

  return (
    <SectionCard title="Ownership" icon={Users}>
      {stints.length === 0 ? (
        <SectionEmpty>Never on a roster in this span</SectionEmpty>
      ) : (
        <>
          {top && (
            <p className="text-[13px] text-muted-foreground">
              Most weeks:{' '}
              <FranchiseLink franchise={top.franchise} viewer={viewer} onClose={onClose} className="font-medium text-foreground" />{' '}
              <span className="tabular">({top.weeks})</span>
            </p>
          )}
          <div className="space-y-3">
            {byYear.map((group) => (
              <div key={group.year}>
                {!season && <h4 className="mb-1 text-sm font-semibold text-foreground tabular">{group.year}</h4>}
                <ul className="space-y-1">
                  {group.stints.map((stint) => {
                    const name = maskFranchise(stint.franchise, viewer);
                    return (
                      <li key={`${stint.seasonId}-${stint.fromWeek}`} className="flex min-w-0 items-center gap-2 text-sm">
                        <TeamAvatar team={{ franchiseId: stint.franchiseId, name, owner: name }} size="xs" />
                        <FranchiseLink franchise={stint.franchise} viewer={viewer} onClose={onClose} className="min-w-0 font-medium text-foreground" />
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular">
                          {weekSpan(stint.fromWeek, stint.toWeek)} · started {stint.starts} of {plural(stint.weeks, 'week')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
