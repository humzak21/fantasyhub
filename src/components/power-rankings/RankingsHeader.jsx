import { BarChart3, LineChart, Trophy } from 'lucide-react';

import PageHeader from '../layout/PageHeader';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

// The table is the default and has no button of its own: each other view is
// a toggle, and pressing the lit one again goes back to the table.
const VIEW_TOGGLES = [
  { id: 'analysis', label: 'Analysis', icon: LineChart },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
];

const HEADINGS = {
  table: { title: (week) => `Week ${week} Power Rankings`, description: 'Power rankings from across the league!' },
  analysis: { title: (week) => `Week ${week} Power Rankings`, description: 'Power rankings from across the league!' },
  statistics: {
    title: () => 'League Statistics',
    description: (week) => `Scoring, defence and luck through week ${week}, and league history compared.`,
  },
};

/**
 * The rankings page header.
 *
 * This lived inline in `FantasyFootballApp.jsx` — sixty lines of title, date
 * badge, switch and toggle inside the shell's tab dispatch, which is why the
 * route table there reads as a chain of `&&` expressions rather than a list of
 * pages. The shell should decide *which* page renders, not what its header
 * looks like.
 *
 * The date badge is gone with it: it printed `new Date()`, today's date, next
 * to a heading naming the week being viewed. On a historical week those two
 * disagree, and today's date is not a fact about the rankings.
 *
 * @param {number} week - the week being viewed
 * @param {'table'|'analysis'|'statistics'} view
 * @param {Function} onViewChange
 */
export function RankingsHeader({
  week,
  view,
  onViewChange,
}) {
  const heading = HEADINGS[view] || HEADINGS.table;
  const description =
    typeof heading.description === 'function' ? heading.description(week) : heading.description;

  return (
    <PageHeader
      icon={view === 'statistics' ? BarChart3 : Trophy}
      title={heading.title(week)}
      description={description}
      actions={VIEW_TOGGLES.map(({ id, label, icon: Icon }) => {
        const pressed = view === id;
        return (
          <Button
            key={id}
            onClick={() => onViewChange(pressed ? 'table' : id)}
            variant="outline"
            size="sm"
            aria-pressed={pressed}
            className={cn(
              'shrink-0 whitespace-nowrap',
              pressed && 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
            )}
          >
            <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {label}
          </Button>
        );
      })}
    />
  );
}

export default RankingsHeader;
