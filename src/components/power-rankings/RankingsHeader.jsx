import { BarChart3, Table2, Trophy } from 'lucide-react';

import PageHeader from '../layout/PageHeader';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';

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
 * @param {boolean} showAdvanced
 * @param {Function} onShowAdvancedChange
 */
export function RankingsHeader({
  week,
  view,
  onViewChange,
  showAdvanced,
  onShowAdvancedChange,
}) {
  const isTable = view === 'table';

  return (
    <PageHeader
      icon={Trophy}
      title={`Week ${week} Power Rankings`}
      description="Nine weighted components, normalised across the league."
      actions={
        <>
          {isTable && (
            <div className="flex items-center gap-2">
              <Switch
                id="advanced-stats"
                checked={showAdvanced}
                onCheckedChange={onShowAdvancedChange}
              />
              <Label htmlFor="advanced-stats" className="cursor-pointer whitespace-nowrap text-sm">
                Advanced stats
              </Label>
            </div>
          )}

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
        </>
      }
    />
  );
}

export default RankingsHeader;
