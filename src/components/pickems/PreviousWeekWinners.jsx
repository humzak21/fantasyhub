import React from 'react';
import { Trophy } from 'lucide-react';

import { useWeeklyPickEmScores } from '../../../hooks/queries/index.js';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { getMaskedUserName } from '../../utils/displayNameUtils';
import { weekWinners } from './weekWinners.js';

/**
 * Last week's pick'em winners, one line under the page header.
 *
 * Before this the only way to see who won was to step the week control back
 * and open that week's Results tab. Every member on the top score is named —
 * see `weekWinners` for why that is not "whoever is ranked 1".
 *
 * `status` is the previous week's entry from `getPickEmStatus`, and its
 * `resultsAvailable` is the gate: the strip must not reveal a week the Results
 * tab itself would still be withholding. Renders nothing while the scores
 * load, for a week with no pick'em row, and for a week nobody scored in —
 * it is a supplement to the page, so a placeholder for something that may not
 * exist would be the wrong shape.
 *
 * @param {object} props
 * @param {number} props.week - the week the winners are from
 * @param {object|null} props.status - that week's `getPickEmStatus` entry
 */
export default function PreviousWeekWinners({ week, status }) {
  const revealed = Boolean(status?.resultsAvailable && status?.pickEmWeekId);
  const { data: scores } = useWeeklyPickEmScores(status?.pickEmWeekId, { enabled: revealed });

  if (!revealed) return null;

  const winners = weekWinners(scores);
  if (winners.length === 0) return null;

  return (
    <WinnersStrip
      label={`Week ${week} ${winners.length > 1 ? 'winners' : 'winner'}`}
      ariaLabel={`Week ${week} pick'em ${winners.length > 1 ? 'winners' : 'winner'}`}
      winners={winners}
    />
  );
}

/**
 * One line naming winners: a trophy, a label, the names and the top score.
 * Shared by the week's winners and the tourney winners, so the two lines under
 * the Pick'ems header read as one set.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.ariaLabel
 * @param {Array<{ userId: string, displayName?: string, totalPoints: number }>} props.winners
 */
export function WinnersStrip({ label, ariaLabel, winners }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const { totalPoints } = winners[0];

  return (
    <p
      className="flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]"
      aria-label={ariaLabel}
    >
      <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-words font-medium text-foreground">
        {winners.map((winner, index) => (
          <React.Fragment key={winner.userId}>
            {index > 0 && ', '}
            {/* Warm means yours: a member who won sees their own name lit. */}
            <span className={winner.userId === user?.id ? 'text-primary' : undefined}>
              {getMaskedUserName(winner.displayName, winner.userId, user, isAdmin, teamOwnerNames)}
            </span>
          </React.Fragment>
        ))}
      </span>
      <span className="tabular text-muted-foreground">
        {totalPoints} {totalPoints === 1 ? 'pt' : 'pts'}
      </span>
    </p>
  );
}
