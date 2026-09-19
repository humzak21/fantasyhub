import { Flame } from 'lucide-react';

import { EmptyState } from '../ui/empty-state';
import { SectionHeading } from '../ui/section-heading';
import { TakeCard } from './TakeCard.jsx';
import { groupByMilestone } from './milestones.js';

/**
 * The board, grouped by when each take comes due.
 *
 * Sections run in resolve order rather than posting order, so the next thing to
 * be settled is at the top and a take posted in August about the championship
 * sits at the bottom where it belongs. Within a section the newest is first.
 *
 * Two-up at `md:` and a single column below it. Cards, not a table, at every
 * width — a take is a paragraph, and there is no column count here that could
 * push a phone into a horizontal scroll.
 */
export function TakesBoard({
  takes = [],
  displayNames = {},
  seasonConfig,
  onOpen,
  onFade,
  onWithdraw,
  onHellYeah,
  onWithdrawHellYeah,
  pendingTakeId,
  emptyAction
}) {
  const sections = groupByMilestone(takes, seasonConfig);

  if (sections.length === 0) {
    return (
      <EmptyState
        icon={Flame}
        title="No takes yet"
        description="Call something before it happens. Every take is graded once its week — or the season — is done."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key}>
          <SectionHeading
            className="mb-4"
            aside={<span className="tabular-nums">{section.takes.length}</span>}
          >
            {section.label}
          </SectionHeading>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {section.takes.map((take) => (
              <TakeCard
                key={take.id}
                take={take}
                displayNames={displayNames}
                onOpen={onOpen}
                onFade={onFade}
                onWithdraw={onWithdraw}
                onHellYeah={onHellYeah}
                onWithdrawHellYeah={onWithdrawHellYeah}
                pending={pendingTakeId === take.id}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default TakesBoard;
