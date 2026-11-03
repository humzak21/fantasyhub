import { Link } from 'react-router-dom';
import { Route } from 'lucide-react';

import { pathToPlayoffsLink } from './pathLink';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';

/**
 * The way into Path to the Playoffs from a standings table, opened on a team.
 * Whether to offer it is `showsPathToPlayoffs`, and the caller's to ask: only
 * the caller knows whether this viewer may open the tab.
 */
export function PathToPlayoffsButton({ teamId = null, onClick, className }) {
  return (
    <Button asChild variant="outline" size="sm" className={cn('shrink-0 text-[13px]', className)}>
      <Link to={pathToPlayoffsLink(teamId)} onClick={onClick}>
        <Route className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Path to the Playoffs
      </Link>
    </Button>
  );
}

export default PathToPlayoffsButton;
