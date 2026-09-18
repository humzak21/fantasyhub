import { BarChart3, Table2, Trophy } from 'lucide-react';

import PageHeader from '../layout/PageHeader';
import { Button } from '../ui/button';

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
 * @param {'table'|'analysis'} view
 * @param {Function} onViewChange
 */
export function RankingsHeader({
  week,
  view,
  onViewChange,
}) {
  const isTable = view === 'table';

  return (
    <PageHeader
      icon={Trophy}
      title={`Week ${week} Power Rankings`}
      description="Power rankings from across the league!"
      actions={
        <Button
          onClick={() => onViewChange(isTable ? 'analysis' : 'table')}
          variant="outline"
          size="sm"
          className="shrink-0 whitespace-nowrap"
        >
          {isTable ? (
            <>
              <BarChart3 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Analysis
            </>
          ) : (
            <>
              <Table2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Table
            </>
          )}
        </Button>
      }
    />
  );
}

export default RankingsHeader;
