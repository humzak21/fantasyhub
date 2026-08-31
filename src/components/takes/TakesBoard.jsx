import { Flame } from 'lucide-react';

import { EmptyState } from '../ui/empty-state';
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
  onPlusOne,
  onWithdraw,
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
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {section.label}
            </h2>
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              {section.takes.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {section.takes.map((take) => (
              <TakeCard
                key={take.id}
                take={take}
                displayNames={displayNames}
                onOpen={onOpen}
                onPlusOne={onPlusOne}
                onWithdraw={onWithdraw}
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
