import { cn } from '../../lib/utils';
import { formatFaab, formatFaabChange } from '../../utils/format';

function Line({ label, title, children }) {
  return (
    <div className="flex items-baseline gap-1" title={title}>
      <dt>{label}</dt>
      <dd className="tabular font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Where a team's FAAB came from and went: the season's budget, what the
 * commissioner awarded, what it traded, so what it had, and what it spent. A
 * team's bids can run past the budget, and this is the line that says why.
 *
 * "Awarded" is a net figure for the team, not a list: ESPN logs that the
 * commissioner changed a budget and not by how much (`utils/faabLedger.js`).
 *
 * Renders nothing until the sync has read a ledger.
 *
 * @param {object} props
 * @param {ReturnType<import('../../../utils/faabLedger.js').faabBalance>} props.ledger
 */
export function FaabBreakdown({ ledger, className }) {
  if (!ledger) return null;

  return (
    <dl aria-label="FAAB this season" className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground', className)}>
      <Line label="Budget">{formatFaab(ledger.budget)}</Line>
      <Line label="Awarded" title="Net of everything the commissioner has added or taken away">
        {formatFaabChange(ledger.awarded)}
      </Line>
      <Line label="Traded" title={`${formatFaab(ledger.tradedIn)} in, ${formatFaab(ledger.tradedOut)} out`}>
        {formatFaabChange(ledger.traded)}
      </Line>
      <Line label="Had">{formatFaab(ledger.had)}</Line>
      <Line label="Spent">{formatFaab(ledger.spent)}</Line>
    </dl>
  );
}

export default FaabBreakdown;
