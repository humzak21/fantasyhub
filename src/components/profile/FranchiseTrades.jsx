import { useMemo } from 'react';
import { ArrowLeftRight } from 'lucide-react';

import { TradeList } from '../history/records/TradeList';
import { buildRecordIdentity } from '../history/records/recordIdentity';
import { SectionHeading } from '../ui/section-heading';
import { SkeletonCards } from '../ui/skeleton';
import { TeamAvatar } from '../ui/team-identity';
import { TeamLink } from '../ui/team-link';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useRecordBook } from '../../../hooks/queries/index.js';
import { tradePartnersOf, tradesForRow } from '../../../utils/recordBook/index.js';

const SURFACE =
  'rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]';

/**
 * Every trade a franchise has made, and how many with each partner.
 *
 * Read off the record book's own query key, which the trophy case above already
 * holds, so this fetches nothing and cannot disagree with History → Records:
 * the list is what "Most trades" opens to, and the partner totals are what
 * "Most frequent trade partners" counts. Names mask through the same identity.
 *
 * A franchise that has never traded has no section, like the awards below.
 */
export function FranchiseTrades({ franchiseId, franchises = [] }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const { data: book, isLoading } = useRecordBook();

  const trades = useMemo(() => tradesForRow(book, { franchiseId }), [book, franchiseId]);
  const partners = useMemo(() => tradePartnersOf(book, franchiseId), [book, franchiseId]);
  const identity = useMemo(
    () => buildRecordIdentity({ franchises, book, user, isAdmin, teamOwnerNames }),
    [franchises, book, user, isAdmin, teamOwnerNames]
  );

  if (isLoading) return <SkeletonCards count={2} label="Loading trades" />;
  if (trades.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="trades-heading">
      <SectionHeading
        id="trades-heading"
        icon={ArrowLeftRight}
        aside={`${trades.length} ${trades.length === 1 ? 'trade' : 'trades'}`}
      >
        Trades
      </SectionHeading>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className={SURFACE}>
          <h3 className="border-b border-border/60 px-3 py-2.5 text-sm font-semibold">By partner</h3>
          <ul aria-label="Trade partners" className="divide-y divide-border/50">
            {partners.map((partner) => {
              const name = identity.franchiseName(partner.franchiseId);
              return (
                <li key={partner.franchiseId} className="flex items-center gap-3 px-3 py-2.5">
                  <TeamAvatar team={identity.avatar(partner.franchiseId)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <TeamLink franchiseId={partner.franchiseId} className="block truncate text-sm font-medium">
                      {name}
                    </TeamLink>
                    <p className="text-xs text-muted-foreground tabular">Last in {partner.lastYear}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular">
                    {partner.trades}
                    <span className="sr-only"> {partner.trades === 1 ? 'trade' : 'trades'}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${SURFACE} p-3`}>
          <h3 className="text-sm font-semibold">Every trade</h3>
          <TradeList trades={trades} identity={identity} />
        </div>
      </div>
    </section>
  );
}

export default FranchiseTrades;
