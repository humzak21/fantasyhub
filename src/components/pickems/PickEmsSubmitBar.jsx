import { CheckCircle2, Edit3, Save, Trophy, X } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/**
 * Progress and the submit control, once.
 *
 * This block existed twice — about eighty-five lines of identical markup at
 * the top and bottom of the page, differing only in the buttons' `size` prop.
 * Both rendered at the same time, so on a phone the reader met the same
 * "Picks made: 5/7 / Submit picks" row twice in one screenful, and the top
 * copy sat in a `flex justify-between` that did not wrap.
 *
 * It sticks to the bottom of the viewport instead. Picking is the thing this
 * page is for, and the count and the button are the state of that task, so
 * they should not scroll away from it. `bottom-16` clears the phone tab bar;
 * from lg up there is no tab bar to clear.
 */
export function PickEmsSubmitBar({
  totalPicks,
  totalGames,
  hasSubmitted,
  isEditing,
  hasChanges,
  submitting,
  user,
  /** Shown in place of the buttons when `user` is null — a visitor, or a
   *  signed-in account the admin has not approved yet; the caller says which. */
  signInMessage = 'Sign in to make picks.',
  onSubmit,
  onEdit,
  onCancelEdit,
}) {
  const complete = totalPicks === totalGames;

  return (
    <div
      className={cn(
        'sticky bottom-16 z-30 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur',
        'sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:rounded-lg lg:border'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">
              {hasSubmitted && !isEditing ? 'Submitted' : 'Picks made'}
            </span>
            <span className="tabular text-sm font-semibold">
              {totalPicks}/{totalGames}
            </span>
          </div>

          {hasSubmitted && !isEditing && (
            <Badge variant="info">
              <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
              All in
            </Badge>
          )}
          {!hasSubmitted && complete && <Badge variant="success">Ready to submit</Badge>}
          {isEditing && hasChanges && <Badge variant="warning">Unsaved changes</Badge>}
        </div>

        <div className="flex items-center gap-2">
          {!user ? (
            <p className="text-sm text-muted-foreground">{signInMessage}</p>
          ) : hasSubmitted && !isEditing ? (
            <Button onClick={onEdit} variant="outline" className="gap-2">
              <Edit3 className="h-4 w-4" aria-hidden="true" />
              Edit picks
            </Button>
          ) : (
            <>
              {isEditing && (
                <Button onClick={onCancelEdit} variant="outline" className="gap-2">
                  <X className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </Button>
              )}
              <Button onClick={onSubmit} disabled={submitting || !complete} className="gap-2">
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-b-transparent" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Submit picks
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Says what is missing rather than leaving a disabled button unexplained. */}
      {user && !complete && !hasSubmitted && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {totalGames - totalPicks} {totalGames - totalPicks === 1 ? 'game' : 'games'} still to pick.
        </p>
      )}
    </div>
  );
}

export default PickEmsSubmitBar;
