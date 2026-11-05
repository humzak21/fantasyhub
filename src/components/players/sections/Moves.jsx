import { useMemo } from 'react';
import { ArrowRightLeft, CircleDashed, Gavel, Minus, Plus, Repeat } from 'lucide-react';

import { cn } from '../../../lib/utils';
import { formatFaab } from '../../../utils/format';
import { FranchiseLink, SectionCard, SectionEmpty } from './SectionCard.jsx';
import { plural } from './sectionFormat.js';

const KIND = {
  add: { icon: Plus, label: 'Added', tone: 'text-success' },
  waiver: { icon: Gavel, label: 'Claimed', tone: 'text-success' },
  drop: { icon: Minus, label: 'Dropped', tone: 'text-destructive' },
  trade: { icon: ArrowRightLeft, label: 'Traded', tone: 'text-info' },
  unknown: { icon: CircleDashed, label: 'Moved', tone: 'text-muted-foreground' }
};

const POOL = <span className="text-muted-foreground">Free agents</span>;

function Path({ move, viewer, onClose }) {
  const link = (franchise) => <FranchiseLink franchise={franchise} viewer={viewer} onClose={onClose} className="min-w-0 text-foreground" />;
  if (move.kind === 'unknown') {
    if (!move.franchises?.length) return null;
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        {move.franchises.map((f, i) => (
          <span key={f.id} className="inline-flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground" aria-hidden="true">·</span>}
            {link(f)}
          </span>
        ))}
      </span>
    );
  }
  const from = move.kind === 'add' || move.kind === 'waiver' ? POOL : link(move.fromFranchise);
  const to = move.kind === 'drop' ? POOL : link(move.toFranchise);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
      {from}
      <span className="text-muted-foreground" aria-label="to">→</span>
      {to}
    </span>
  );
}

/**
 * Every transaction that moved him, newest first: adds, waiver claims with
 * the bid, drops and trades, with where he went from and to.
 */
export default function Moves({ profile, season, viewer, onClose }) {
  const moves = useMemo(
    () => (profile.moves ?? []).filter((m) => !season || m.seasonId === season.seasonId),
    [profile.moves, season]
  );

  return (
    <SectionCard title="Moves" icon={Repeat}>
      {moves.length === 0 ? (
        <SectionEmpty>No recorded moves</SectionEmpty>
      ) : (
        <ol className="space-y-2">
          {moves.map((move) => {
            const kind = KIND[move.kind] ?? KIND.unknown;
            const Icon = kind.icon;
            const others = move.kind === 'trade' ? move.counterparts?.length ?? 0 : 0;
            return (
              <li key={move.id} className="flex min-w-0 items-start gap-2.5 text-sm">
                <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted', kind.tone)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-medium text-foreground">{kind.label}</span>
                    {move.kind === 'waiver' && move.bidAmount != null && (
                      <span className="font-semibold text-foreground tabular">{formatFaab(move.bidAmount)}</span>
                    )}
                    <span className="text-xs text-muted-foreground tabular">
                      {[move.year, move.week != null ? `Wk ${move.week}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <Path move={move} viewer={viewer} onClose={onClose} />
                  {others > 0 && (
                    <p className="text-xs text-muted-foreground">With {plural(others, 'other player')} in the deal</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
