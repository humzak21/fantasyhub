import { Lock, Pencil } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { OpponentChip } from '../ui/opponent-chip';
import { cn } from '../../lib/utils';
import { getPositionColor } from '../../utils/positionColors';
import { ParlayPickStatus } from './LiveTdIndicator.jsx';
import { pickOutcome } from './liveTdOutcome.js';

/** The pick as stored, with its live status and, once graded, the final grade. */
export const ParlayCurrentPick = ({ pick, opponent, canEdit, onEdit, showGrade, live }) => {
  const outcome = pickOutcome({ scoredTd: pick.scoredTd, live });
  return (
  <div
    className={cn(
      'flex flex-wrap items-center gap-3 rounded-lg border p-3',
      outcome === 'hit'
        ? 'border-success/40 bg-success/15'
        : outcome === 'miss'
          ? 'border-destructive/40 bg-destructive/15'
          : 'border-border bg-muted/30'
    )}
  >
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate font-semibold">{pick.playerNameRaw}</span>
        {pick.player?.position && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
              getPositionColor(pick.player.position)
            )}
          >
            {pick.player.position}
          </span>
        )}
        {pick.player?.teamAbbreviation && (
          <span className="text-xs text-muted-foreground">{pick.player.teamAbbreviation}</span>
        )}
        <OpponentChip entry={opponent} warnOnBye />
        {!pick.playerId && (
          <Badge variant="outline" className="text-[10px]">
            Not in our player list
          </Badge>
        )}
      </div>
      {(showGrade || live) && (
        <div className="mt-2">
          <ParlayPickStatus scoredTd={pick.scoredTd} live={live} showPendingDash={showGrade} />
        </div>
      )}
    </div>

    {canEdit ? (
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Change
      </Button>
    ) : (
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    )}
  </div>
  );
};

export default ParlayCurrentPick;
