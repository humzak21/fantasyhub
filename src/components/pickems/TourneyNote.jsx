import React from 'react';
import { Trophy } from 'lucide-react';

import { cn } from '../../lib/utils';
import { PICK_EM_TOURNEYS } from './tourneys.js';

/**
 * The two tourneys, stated where the reader is about to act on them.
 *
 * One component in two places — the Standings tab, where a member checks where
 * they stand, and the Make Picks page, where they decide whether to enter this
 * week — because a prize described differently in two places is a prize the
 * league has to argue about. The rules themselves live in `tourneys.js`.
 *
 * `compact` is the Make Picks face: the same facts on one line each, under the
 * week's heading, where the page's job is the picks rather than the rules.
 *
 * @param {object} props
 * @param {boolean} [props.compact]
 * @param {number|null} [props.currentWeek] - marks the tourney in progress
 */
export default function TourneyNote({ compact = false, currentWeek = null, className }) {
  const week = Number(currentWeek);

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/20 p-3',
        compact ? 'text-[13px]' : 'text-sm',
        className
      )}
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Trophy className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        Two tourneys this season
      </p>

      <p className="mt-1.5 text-muted-foreground">
        Pick&rsquo;ems results are tracked for the year, so the season runs as two
        in-season tourneys.
      </p>

      <ul className="mt-2 space-y-1.5">
        {PICK_EM_TOURNEYS.map((tourney) => {
          const isCurrent =
            Number.isFinite(week) && week >= tourney.startWeek && week <= tourney.endWeek;
          const span = tourney.endWeek - tourney.startWeek + 1;

          return (
            <li key={tourney.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-foreground">{tourney.weeks}</span>
              <span className="text-muted-foreground">&mdash; winner takes {tourney.prize}.</span>
              {/* The floor is the half of the rule a reader is most likely to
                  be caught out by, so it is stated beside the prize rather
                  than as a footnote under both. */}
              <span className="text-muted-foreground">
                Enter at least {tourney.minWeeks} of the {span} weeks to be eligible.
              </span>
              {isCurrent && (
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-primary">
                  In progress
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
