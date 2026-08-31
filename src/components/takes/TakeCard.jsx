import { Flame, Plus, Check } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn, formatDate } from '../../lib/utils';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  canPlusOne,
  hasPlusOned,
  plusOneCount
} from './milestones.js';

/**
 * One take on the board.
 *
 * A card stack at every width — there is no table here and so no fifth column
 * to push a phone into a horizontal scroll. The card is the click target for
 * the detail sheet, which is why the +1 button stops propagation: co-signing
 * and opening are two different intentions on the same rectangle.
 */
export function TakeCard({ take, displayNames = {}, onOpen, onPlusOne, onWithdraw, pending }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const authorName = getMaskedUserName(
    displayNames[take.userId],
    take.userId,
    user,
    isAdmin,
    teamOwnerNames
  );

  const count = plusOneCount(take);
  const joined = hasPlusOned(take, user);
  const canToggle = canPlusOne(take, user);

  const handleToggle = (event) => {
    event.stopPropagation();
    if (joined) onWithdraw?.(take);
    else onPlusOne?.(take);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(take)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(take);
        }
      }}
      className={cn(
        'w-full rounded-lg border border-border bg-card p-4 text-left transition-colors',
        'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]',
        'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{authorName}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {formatDate(take.createdAt)}
            {/* Server-stamped, so this cannot be forged or forgotten — see
                set_take_edited_at() in the migration. */}
            {take.editedAt && <span className="normal-case tracking-normal"> · edited</span>}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[take.status] ?? 'secondary'}>
          {STATUS_LABEL[take.status] ?? take.status}
        </Badge>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {take.body}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        {/* The count is always visible; only the control is conditional. A
            signed-out reader still needs to see that six people called this. */}
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          {count} {count === 1 ? 'co-sign' : 'co-signs'}
        </span>

        {canToggle && (
          <Button
            variant={joined ? 'secondary' : 'outline'}
            size="sm"
            onClick={handleToggle}
            disabled={pending}
            className="gap-1.5"
          >
            {joined ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Joined
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                +1
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export default TakeCard;
