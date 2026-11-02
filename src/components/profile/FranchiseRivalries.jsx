import { Link } from 'react-router-dom';
import { ChevronRight, Target } from 'lucide-react';

import { SectionHeading } from '../ui/section-heading';
import { TeamAvatar } from '../ui/team-identity';
import { TeamLink } from '../ui/team-link';
import { cn } from '../../lib/utils';
import { formatRecord } from '../../utils/format';
import { headToHeadPath } from '../history/headtohead/headToHeadLink';
import { getMaskedFranchiseName } from '../history/utils/privacyHelpers';

const SURFACE =
  'rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]';

const toneOf = (winPct) => {
  if (winPct > 0.5) return 'text-success';
  if (winPct < 0.5) return 'text-destructive';
  return 'text-foreground';
};

function Opponent({ matchup, franchise, name, h2hPath }) {
  const pct = Math.round(matchup.winPct * 100);
  const team = franchise
    ? { franchiseId: matchup.opponentId, owner_name: franchise.owner_name }
    : { franchiseId: matchup.opponentId, name };

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <TeamAvatar team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <TeamLink franchiseId={matchup.opponentId} className="block truncate text-sm font-medium">
          {name}
        </TeamLink>
        {/* A tug of war, not a probability: this franchise's share of the wins. */}
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-current opacity-70" style={{ width: `${pct}%`, color: 'var(--primary)' }} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-sm font-semibold tabular', toneOf(matchup.winPct))}>{formatRecord(matchup)}</p>
        <p className="text-xs text-muted-foreground tabular">
          {matchup.totalGames} {matchup.totalGames === 1 ? 'game' : 'games'}
        </p>
      </div>
      {h2hPath && (
        <Link
          to={h2hPath}
          aria-label={`Head-to-head with ${name}`}
          className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-8"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

function Column({ title, tone, matchups, ...rest }) {
  return (
    <div className="min-w-0 space-y-2">
      <h3 className={cn('text-sm font-semibold', tone)}>
        {title} <span className="font-normal text-muted-foreground tabular">{matchups.length}</span>
      </h3>
      <ul className={cn(SURFACE, 'divide-y divide-border')}>
        {matchups.map((matchup) => (
          <Opponent
            key={matchup.opponentId}
            matchup={matchup}
            franchise={rest.byId.get(matchup.opponentId)}
            name={rest.nameOf(matchup.opponentId)}
            h2hPath={rest.linkH2H ? headToHeadPath(rest.franchiseId, matchup.opponentId) : null}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Every opponent this franchise has ever played, not a top three of each: the
 * ones it has the better of, then the ones that have the better of it, worst
 * first. A dead-even series sits with the first group, in neutral.
 *
 * @param {object} props
 * @param {Array} props.rivalries - `getFranchiseProfile().rivalries`, best first
 * @param {boolean} props.linkH2H - can this viewer open History
 */
export function FranchiseRivalries({ franchiseId, rivalries = [], franchises = [], viewer, linkH2H }) {
  if (rivalries.length === 0) return null;

  const { user, isAdmin, teamOwnerNames } = viewer;
  const byId = new Map(franchises.map((franchise) => [franchise.id, franchise]));
  const nameOf = (id) => getMaskedFranchiseName(byId.get(id) ?? { id }, user, isAdmin, teamOwnerNames);
  const shared = { byId, nameOf, linkH2H, franchiseId };

  const best = rivalries.filter((matchup) => matchup.winPct >= 0.5);
  const toughest = rivalries.filter((matchup) => matchup.winPct < 0.5).reverse();

  return (
    <section className="space-y-4" aria-labelledby="rivalries-heading">
      <SectionHeading id="rivalries-heading" icon={Target} aside={`${rivalries.length} opponents`}>
        Head-to-head rivalries
      </SectionHeading>
      <div className="grid items-start gap-5 md:grid-cols-2">
        {best.length > 0 && <Column title="Best matchups" tone="text-success" matchups={best} {...shared} />}
        {toughest.length > 0 && (
          <Column title="Toughest opponents" tone="text-destructive" matchups={toughest} {...shared} />
        )}
      </div>
    </section>
  );
}

export default FranchiseRivalries;
