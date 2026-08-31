import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  deltaDirection,
  formatDelta,
  formatPct,
  formatPoints,
  formatRecord,
  formatSignedPct,
} from '../../utils/format';

/**
 * A number, set so it lines up with the numbers above and below it.
 *
 * Every numeric cell in the app goes through here. Two things it fixes:
 *
 *   - One face. `font-mono` was doing the job of `tabular-nums` at 31 call
 *     sites, on a page where the surrounding text is Inter — a system mono at
 *     14px has a visibly different x-height, so numbers looked pasted in.
 *     Inter has tabular figures; `.tabular` turns them on.
 *   - One precision. The formatter is chosen by `variant`, not by each caller
 *     remembering whether this particular percentage takes one decimal or two.
 *
 * `emphasis="signed"` colours by sign — the only place a red/green pair is
 * automatic, so a row cannot end up with six independently-scaled ones.
 */
const VARIANT_FORMATTERS = {
  points: formatPoints,
  percent: formatPct,
  delta: formatDelta,
  signedPercent: formatSignedPct,
  plain: (v) => (v === null || v === undefined ? '—' : String(v)),
};

const NumberText = React.forwardRef(
  (
    {
      value,
      variant = 'points',
      decimals,
      emphasis = 'none',
      display = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const format = VARIANT_FORMATTERS[variant] ?? VARIANT_FORMATTERS.plain;
    const text =
      children ?? (decimals === undefined ? format(value) : format(value, decimals));

    const direction = emphasis === 'signed' ? deltaDirection(value) : 'neutral';

    return (
      <span
        ref={ref}
        className={cn(
          'tabular',
          display && 'font-display font-semibold tracking-tight',
          direction === 'positive' && 'text-success',
          direction === 'negative' && 'text-destructive',
          className
        )}
        {...props}
      >
        {text}
      </span>
    );
  }
);
NumberText.displayName = 'NumberText';

/**
 * A win-loss record. Its own component because a record is not one number —
 * it must not be centre-aligned like one, and it never takes a sign colour.
 */
const RecordText = React.forwardRef(({ wins, losses, ties, record, className, ...props }, ref) => (
  <span ref={ref} className={cn('tabular whitespace-nowrap', className)} {...props}>
    {record ? formatRecord(record) : formatRecord(wins, losses, ties)}
  </span>
));
RecordText.displayName = 'RecordText';

export { NumberText, RecordText };
